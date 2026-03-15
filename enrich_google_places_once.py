from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen


DATA_PATH = Path("data/minigolf_atlas_germany.json")
SUMMARY_PATH = Path("data/minigolf_atlas_summary.json")
CACHE_PATH = Path("data/minigolf_places_v1_cache.json")
UNRESOLVED_PATH = Path("data/minigolf_places_unresolved.json")
SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
PHOTO_URL_TEMPLATE = "https://places.googleapis.com/v1/{photo_name}/media"
USER_AGENT = "gGolf-google-places-enrich/1.0"

FIELD_MASK = (
    "places.id,"
    "places.displayName,"
    "places.formattedAddress,"
    "places.location,"
    "places.types,"
    "places.rating,"
    "places.userRatingCount,"
    "places.businessStatus,"
    "places.websiteUri,"
    "places.nationalPhoneNumber,"
    "places.googleMapsUri,"
    "places.regularOpeningHours,"
    "places.photos,"
    "places.editorialSummary"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Enrich existing geocoded records with Google Places metadata")
    parser.add_argument("--api-key-file", default="apikey", help="Path to file containing API key")
    parser.add_argument("--max-records", type=int, default=0, help="Optional cap for test runs")
    parser.add_argument("--sleep-ms", type=int, default=80, help="Delay between requests in milliseconds")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing venue_* fields")
    return parser.parse_args()


def read_api_key(path: Path) -> str:
    key = path.read_text(encoding="utf-8").strip()
    if not key:
        raise RuntimeError("API key file is empty")
    return key


def search_place(query: str, api_key: str) -> dict[str, Any]:
    payload = json.dumps({"textQuery": query, "languageCode": "de"}).encode("utf-8")
    req = Request(
        SEARCH_URL,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": FIELD_MASK,
        },
    )
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_text_query(record: dict[str, Any]) -> str:
    if record.get("venue_name") and record.get("postcode") and record.get("place"):
        return f"{record['venue_name']}, {record['postcode']} {record['place']}, Germany"

    address = " ".join(
        p for p in [record.get("street_name", ""), record.get("house_number", ""), record.get("house_number_addon", "")] if p
    ).strip()
    if not address:
        address = record.get("address_raw", "") or record.get("address_extra", "")

    place = " ".join(p for p in [record.get("postcode", ""), record.get("place", "")] if p).strip()
    parts = [address, place, "Germany"]
    return ", ".join([p for p in parts if p]).strip(" ,")


def photo_link(photo_name: str, api_key: str, max_width: int = 800) -> str:
    url = PHOTO_URL_TEMPLATE.format(photo_name=photo_name)
    return f"{url}?maxWidthPx={max_width}&key={api_key}"


def apply_place_data(record: dict[str, Any], place: dict[str, Any], api_key: str, overwrite: bool) -> None:
    def set_if(field: str, value: Any) -> None:
        if value in (None, "", []):
            return
        if overwrite or not record.get(field):
            record[field] = value

    set_if("venue_name", (place.get("displayName") or {}).get("text"))
    set_if("venue_category", ",".join(place.get("types") or []))
    set_if("venue_website", place.get("websiteUri"))
    set_if("venue_phone", place.get("nationalPhoneNumber"))
    set_if("venue_google_rating", place.get("rating"))
    set_if("venue_google_rating_count", place.get("userRatingCount"))
    set_if("venue_business_status", place.get("businessStatus"))
    set_if("venue_google_maps_url", place.get("googleMapsUri"))
    set_if("venue_address_google", place.get("formattedAddress"))
    set_if("venue_google_place_id", place.get("id"))

    opening = (place.get("regularOpeningHours") or {}).get("weekdayDescriptions")
    if opening:
        set_if("venue_opening_hours_google", " | ".join(opening))

    photos = place.get("photos") or []
    if photos:
        photo_name = photos[0].get("name")
        if photo_name:
            set_if("venue_photo_url", photo_link(photo_name, api_key))


def main() -> None:
    args = parse_args()
    api_key = read_api_key(Path(args.api_key_file))

    records = load_json(DATA_PATH, [])
    if not records:
        raise RuntimeError("No records found in dataset")

    cache: dict[str, Any] = load_json(CACHE_PATH, {})
    unresolved: list[dict[str, Any]] = []

    processed = 0
    enriched = 0
    for i, record in enumerate(records):
        if args.max_records and processed >= args.max_records:
            break

        query = build_text_query(record)
        if not query:
            unresolved.append({"index": i, "reason": "empty_query"})
            continue

        processed += 1

        cached = cache.get(query)
        if cached is None:
            try:
                data = search_place(query, api_key)
            except Exception as exc:
                unresolved.append({"index": i, "query": query, "status": f"NETWORK_ERROR: {exc}"})
                time.sleep(max(0, args.sleep_ms) / 1000)
                continue
            places = data.get("places") or []
            if not places:
                error = (data.get("error") or {}).get("message") or data.get("status") or "NO_RESULTS"
                cache[query] = {"status": "EMPTY", "place": None}
                unresolved.append({"index": i, "query": query, "status": error})
                time.sleep(max(0, args.sleep_ms) / 1000)
                continue

            cache[query] = {"status": "OK", "place": places[0]}
            time.sleep(max(0, args.sleep_ms) / 1000)
            cached = cache[query]

        if cached.get("status") != "OK" or not cached.get("place"):
            unresolved.append({"index": i, "query": query, "status": cached.get("status")})
            continue

        apply_place_data(record, cached["place"], api_key, args.overwrite)
        enriched += 1

        if processed % 100 == 0:
            print(f"Processed {processed}, enriched {enriched}")
            save_json(CACHE_PATH, cache)

    save_json(CACHE_PATH, cache)
    save_json(DATA_PATH, records)
    save_json(UNRESOLVED_PATH, unresolved)

    summary = load_json(SUMMARY_PATH, {})
    summary["venue_google_enriched_records"] = sum(1 for r in records if bool(r.get("venue_google_place_id")))
    summary["venue_with_photo_url"] = sum(1 for r in records if bool(r.get("venue_photo_url")))
    summary["venue_with_google_rating"] = sum(1 for r in records if r.get("venue_google_rating") is not None)
    summary["venue_enrichment_provider"] = "google_places"
    summary["venue_enrichment_unresolved"] = len(unresolved)
    summary["venue_enrichment_generated_at_unix"] = int(time.time())
    save_json(SUMMARY_PATH, summary)

    print(f"Done. processed={processed}, enriched={enriched}, unresolved={len(unresolved)}")


if __name__ == "__main__":
    main()
