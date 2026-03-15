from __future__ import annotations

import argparse
import csv
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DATA_PATH = Path("data/minigolf_atlas_germany.json")
CSV_PATH = Path("data/minigolf_atlas_germany.csv")
SUMMARY_PATH = Path("data/minigolf_atlas_summary.json")
UNRESOLVED_PATH = Path("data/minigolf_atlas_unresolved_google.json")
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
USER_AGENT = "gGolf-google-geocode-once/1.0"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="One-shot Google geocoding for minigolf dataset")
    parser.add_argument("--api-key-file", default="apikey", help="Path to file that contains only the API key")
    parser.add_argument("--workers", type=int, default=12, help="Number of parallel workers")
    parser.add_argument("--timeout", type=int, default=25, help="HTTP timeout seconds")
    parser.add_argument("--max-records", type=int, default=0, help="Optional limit for testing")
    return parser.parse_args()


def read_api_key(path: Path) -> str:
    value = path.read_text(encoding="utf-8").strip()
    if not value:
        raise RuntimeError("API key file is empty")
    return value


def build_query(record: dict[str, Any]) -> str:
    street_name = (record.get("street_name") or "").strip()
    house_number = (record.get("house_number") or "").strip()
    house_addon = (record.get("house_number_addon") or "").strip()
    address_extra = (record.get("address_extra") or "").strip()
    postcode = (record.get("postcode") or "").strip()
    place = (record.get("place") or record.get("place_raw") or "").strip()

    address_line = " ".join(part for part in [street_name, house_number, house_addon] if part).strip()
    if not address_line:
        address_line = address_extra or (record.get("address_raw") or "").strip()

    parts = [address_line, " ".join(part for part in [postcode, place] if part).strip(), "Germany"]
    return ", ".join(part for part in parts if part).strip(" ,")


def fetch_json(url: str, timeout: int) -> dict[str, Any]:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def geocode_one(index: int, query: str, key: str, timeout: int) -> tuple[int, str, dict[str, Any] | None, str]:
    params = urlencode({"address": query, "key": key, "region": "de", "language": "de"})
    url = f"{GEOCODE_URL}?{params}"
    payload = fetch_json(url, timeout)
    status = payload.get("status", "UNKNOWN")

    if status != "OK" or not payload.get("results"):
        return index, query, None, status

    result = payload["results"][0]
    geometry = result.get("geometry") or {}
    location = geometry.get("location") or {}
    components = result.get("address_components") or []

    comp_map: dict[str, str] = {}
    for comp in components:
        long_name = comp.get("long_name")
        types = comp.get("types") or []
        if not long_name:
            continue
        for t in types:
            if t not in comp_map:
                comp_map[t] = long_name

    geocoded = {
        "latitude": location.get("lat"),
        "longitude": location.get("lng"),
        "geocode_query": query,
        "geocode_display_name": result.get("formatted_address"),
        "geocode_source": "google_geocoding",
        "geocode_confidence": geometry.get("location_type"),
        "street_name": comp_map.get("route"),
        "house_number": comp_map.get("street_number"),
        "postcode": comp_map.get("postal_code"),
        "resolved_place": comp_map.get("locality") or comp_map.get("postal_town") or comp_map.get("administrative_area_level_3"),
        "district": comp_map.get("sublocality") or comp_map.get("neighborhood"),
        "state": comp_map.get("administrative_area_level_1"),
        "county": comp_map.get("administrative_area_level_2"),
        "country": comp_map.get("country"),
        "country_code": "DE",
    }
    return index, query, geocoded, status


def apply_update(record: dict[str, Any], geocoded: dict[str, Any]) -> None:
    # OSM coordinates are authoritative and must not be overwritten by address geocoding.
    has_osm_reference = bool(record.get("osm_id") and record.get("osm_type"))

    if (
        not has_osm_reference
        and isinstance(geocoded.get("latitude"), (int, float))
        and isinstance(geocoded.get("longitude"), (int, float))
    ):
        record["latitude"] = float(geocoded["latitude"])
        record["longitude"] = float(geocoded["longitude"])

    for key in (
        "geocode_query",
        "geocode_display_name",
        "geocode_source",
        "geocode_confidence",
        "district",
        "state",
        "county",
        "country",
        "country_code",
    ):
        value = geocoded.get(key)
        if value:
            record[key] = value

    street_name = geocoded.get("street_name")
    if street_name:
        record["street_name"] = street_name

    house_number = geocoded.get("house_number")
    if house_number and not record.get("house_number"):
        record["house_number"] = house_number

    postcode = geocoded.get("postcode")
    if postcode and not record.get("postcode"):
        record["postcode"] = postcode

    resolved_place = geocoded.get("resolved_place")
    if resolved_place:
        record["resolved_place"] = resolved_place
        if not record.get("place"):
            record["place"] = resolved_place


def write_csv(records: list[dict[str, Any]]) -> None:
    if not records:
        return
    keys: list[str] = []
    seen: set[str] = set()
    for row in records:
        for key in row.keys():
            if key not in seen:
                seen.add(key)
                keys.append(key)
    with CSV_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        for row in records:
            row_copy = dict(row)
            if isinstance(row_copy.get("course_types"), list):
                row_copy["course_types"] = "|".join(row_copy["course_types"])
            if isinstance(row_copy.get("approved_course_types"), list):
                row_copy["approved_course_types"] = "|".join(row_copy["approved_course_types"])
            writer.writerow(row_copy)


def update_summary(records: list[dict[str, Any]]) -> None:
    summary: dict[str, Any] = {}
    if SUMMARY_PATH.exists():
        summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))

    summary["total_records"] = len(records)
    summary["records_with_coordinates"] = sum(1 for r in records if r.get("latitude") is not None and r.get("longitude") is not None)
    summary["records_with_venue_name"] = sum(1 for r in records if bool(r.get("venue_name")))
    summary["records_with_website"] = sum(1 for r in records if bool(r.get("venue_website") or r.get("detail_website")))
    summary["geocode_last_provider"] = "google_geocoding"
    summary["geocode_generated_at_unix"] = int(time.time())

    SUMMARY_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    key = read_api_key(Path(args.api_key_file))

    records = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    unresolved: list[dict[str, Any]] = []

    pending: list[tuple[int, str]] = []
    for idx, record in enumerate(records):
        if args.max_records and len(pending) >= args.max_records:
            break
        # OSM rows should be resolved via OSM import/enrichment, not address geocoding.
        if record.get("osm_id") and record.get("osm_type"):
            unresolved.append({"index": idx, "reason": "skip_osm_reference", "record": record})
            continue
        if record.get("latitude") is not None and record.get("longitude") is not None:
            continue
        query = build_query(record)
        if not query:
            unresolved.append({"index": idx, "reason": "empty_query", "record": record})
            continue
        pending.append((idx, query))

    if not pending:
        print("No unresolved records to geocode.")
        return

    print(f"Geocoding {len(pending)} records with {args.workers} workers...")

    success = 0
    failed = 0
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(geocode_one, idx, query, key, args.timeout) for idx, query in pending]
        for n, future in enumerate(as_completed(futures), start=1):
            idx, query, geocoded, status = future.result()
            if geocoded is None:
                failed += 1
                unresolved.append({"index": idx, "query": query, "status": status})
            else:
                success += 1
                apply_update(records[idx], geocoded)

            if n % 100 == 0:
                print(f"Processed {n}/{len(pending)} (ok={success}, failed={failed})")

    DATA_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(records)
    update_summary(records)
    UNRESOLVED_PATH.write_text(json.dumps(unresolved, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Done. ok={success}, failed={failed}, unresolved_file={UNRESOLVED_PATH}")


if __name__ == "__main__":
    main()
