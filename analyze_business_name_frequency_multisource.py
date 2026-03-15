"""
Multi-source business name frequency analysis for Germany.

Sources used:
  1. OpenStreetMap via Overpass API  (free, open data, near-complete coverage)
     https://overpass-api.de/api/interpreter
  2. Google Places API (searchText) – uses ./apikey

Categories: pizzeria, eisdiele, friseur

Run:
  python analyze_business_name_frequency_multisource.py
  python analyze_business_name_frequency_multisource.py --no-google   # OSM only, no API key needed
  python analyze_business_name_frequency_multisource.py --no-osm      # Google only
"""
from __future__ import annotations

import argparse
import json
import re
import time
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
GOOGLE_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
USER_AGENT = "gGolf-business-name-frequency-multisource/1.0"

# Germany bounding box
LAT_MIN, LAT_MAX = 47.2, 55.1
LNG_MIN, LNG_MAX = 5.8, 15.2

# --------------------------------------------------------------------------- #
# OSM tag definitions per category
# Overpass QL: all nodes/ways/relations matching ANY of the tag filter sets.
# --------------------------------------------------------------------------- #
OSM_QUERIES: dict[str, str] = {
    "pizzeria": """
[out:json][timeout:300];
area["ISO3166-1"="DE"][admin_level=2]->.de;
(
  nwr(area.de)["amenity"="restaurant"]["cuisine"~"pizza|italian",i];
  nwr(area.de)["amenity"="fast_food"]["cuisine"~"pizza",i];
  nwr(area.de)["amenity"="restaurant"]["name"~"pizzeria|pizza",i];
  nwr(area.de)["cuisine"="pizza"];
);
out center tags;
""",
    "eisdiele": """
[out:json][timeout:300];
area["ISO3166-1"="DE"][admin_level=2]->.de;
(
  nwr(area.de)["amenity"="ice_cream"];
  nwr(area.de)["shop"="ice_cream"];
  nwr(area.de)["amenity"="cafe"]["cuisine"~"ice_cream|gelato|eis",i];
  nwr(area.de)["amenity"="restaurant"]["cuisine"~"ice_cream|gelato",i];
  nwr(area.de)["amenity"="cafe"]["name"~"eiscafe|eisdielen|eisdiele|gelateria",i];
);
out center tags;
""",
    "friseur": """
[out:json][timeout:300];
area["ISO3166-1"="DE"][admin_level=2]->.de;
(
  nwr(area.de)["shop"="hairdresser"];
  nwr(area.de)["shop"="barber"];
);
out center tags;
""",
}

# Google search terms per category
GOOGLE_QUERIES: dict[str, list[str]] = {
    "pizzeria": ["pizzeria", "pizza restaurant"],
    "eisdiele": ["eisdiele", "eiscafe", "gelateria"],
    "friseur": ["friseur", "haarsalon", "haarstudio", "barbershop"],
}

GOOGLE_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.types"


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Multi-source (OSM + Google) business name frequency for Germany")
    p.add_argument("--api-key-file", default="apikey")
    p.add_argument("--no-google", action="store_true", help="Skip Google Places (no API key needed)")
    p.add_argument("--no-osm", action="store_true", help="Skip Overpass/OSM query")
    p.add_argument("--google-grid-step", type=float, default=1.2)
    p.add_argument("--google-max-cells", type=int, default=0)
    p.add_argument("--sleep-ms", type=int, default=60)
    p.add_argument("--top-n", type=int, default=15)
    p.add_argument("--out", default="data/business_name_frequency_multisource_report.json")
    return p.parse_args()


def read_api_key(path: Path) -> str:
    value = path.read_text(encoding="utf-8").strip()
    if not value:
        raise RuntimeError("API key file is empty")
    return value


def canonicalize(name: str) -> str:
    """Lower-case, ASCII-fold, strip branch suffixes, normalise whitespace."""
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    text = text.lower().strip()
    text = re.split(r"\s[-|–,:]\s", text, maxsplit=1)[0]
    text = text.replace("&", " und ")
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


# --------------------------------------------------------------------------- #
# Overpass fetcher
# --------------------------------------------------------------------------- #

def fetch_overpass(category: str) -> list[dict[str, Any]]:
    query = OSM_QUERIES[category].strip()
    body = urlencode({"data": query}).encode("utf-8")
    req = Request(
        OVERPASS_URL,
        data=body,
        method="POST",
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    print(f"  [OSM] Fetching {category} from Overpass API …")
    with urlopen(req, timeout=360) as resp:
        payload = json.loads(resp.read().decode("utf-8", errors="replace"))
    elements = payload.get("elements") or []
    print(f"  [OSM] {category}: {len(elements)} elements returned")
    return elements


def osm_element_to_record(el: dict[str, Any], category: str) -> dict[str, Any] | None:
    tags = el.get("tags") or {}
    name = str(tags.get("name") or tags.get("name:de") or "").strip()
    if not name:
        return None
    # Extract coords
    lat, lng = None, None
    if isinstance(el.get("lat"), (int, float)):
        lat, lng = float(el["lat"]), float(el["lon"])
    elif isinstance((el.get("center") or {}).get("lat"), (int, float)):
        lat = float(el["center"]["lat"])
        lng = float(el["center"]["lon"])
    return {
        "source": "osm",
        "osm_id": f"{el.get('type','?')}/{el.get('id','')}",
        "category": category,
        "name": name,
        "lat": lat,
        "lng": lng,
        "country": "DE",
    }


# --------------------------------------------------------------------------- #
# Google Places fetcher
# --------------------------------------------------------------------------- #

def build_cells(step: float) -> list[tuple[float, float]]:
    cells: list[tuple[float, float]] = []
    lat = LAT_MIN
    while lat <= LAT_MAX + 1e-9:
        lng = LNG_MIN
        while lng <= LNG_MAX + 1e-9:
            cells.append((round(lat, 4), round(lng, 4)))
            lng += step
        lat += step
    return cells


def google_search_text(query: str, lat: float, lng: float, api_key: str) -> dict[str, Any]:
    payload = {
        "textQuery": query,
        "languageCode": "de",
        "regionCode": "DE",
        "maxResultCount": 20,
        "locationBias": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": 50000.0,
            }
        },
    }
    req = Request(
        GOOGLE_SEARCH_URL,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": GOOGLE_FIELD_MASK,
        },
    )
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def is_germany_place(place: dict[str, Any]) -> bool:
    for comp in place.get("addressComponents") or []:
        if "country" in (comp.get("types") or []):
            if str(comp.get("shortText") or "").upper() == "DE":
                return True
    addr = str(place.get("formattedAddress") or "").lower()
    return "deutschland" in addr or ", germany" in addr


def fetch_google(category: str, api_key: str, grid_step: float, max_cells: int, sleep_ms: int) -> list[dict[str, Any]]:
    cells = build_cells(grid_step)
    if max_cells > 0:
        cells = cells[:max_cells]
    queries = GOOGLE_QUERIES[category]
    seen: dict[str, dict[str, Any]] = {}
    call_count = 0
    for query in queries:
        print(f"  [Google] {category}/{query}: {len(cells)} cells …")
        for i, (lat, lng) in enumerate(cells, start=1):
            call_count += 1
            try:
                data = google_search_text(query, lat, lng, api_key)
            except Exception as exc:
                print(f"    !! error cell ({lat},{lng}): {exc}")
                continue
            for place in data.get("places") or []:
                pid = str(place.get("id") or "")
                name = str((place.get("displayName") or {}).get("text") or "").strip()
                if not pid or not name or not is_germany_place(place):
                    continue
                loc = place.get("location") or {}
                seen[pid] = {
                    "source": "google",
                    "google_place_id": pid,
                    "category": category,
                    "name": name,
                    "lat": loc.get("latitude"),
                    "lng": loc.get("longitude"),
                    "country": "DE",
                }
            if i % 20 == 0:
                print(f"    {i}/{len(cells)} cells, {len(seen)} unique so far")
            time.sleep(max(0, sleep_ms) / 1000)
    print(f"  [Google] {category}: {len(seen)} unique places ({call_count} calls)")
    return list(seen.values())


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #

def main() -> None:
    args = parse_args()
    out_path = Path(args.out)

    api_key: str | None = None
    if not args.no_google:
        api_key = read_api_key(Path(args.api_key_file))

    all_records: dict[str, list[dict[str, Any]]] = defaultdict(list)
    osm_counts: dict[str, int] = {}
    google_counts: dict[str, int] = {}

    for category in OSM_QUERIES:
        print(f"\n{'='*60}")
        print(f"Category: {category}")

        osm_records: list[dict[str, Any]] = []
        if not args.no_osm:
            try:
                elements = fetch_overpass(category)
                for el in elements:
                    rec = osm_element_to_record(el, category)
                    if rec:
                        osm_records.append(rec)
                # small courtesy delay between Overpass requests
                time.sleep(3)
            except Exception as exc:
                print(f"  [OSM] ERROR: {exc}")
        osm_counts[category] = len(osm_records)
        all_records[category].extend(osm_records)

        google_records: list[dict[str, Any]] = []
        if not args.no_google and api_key:
            try:
                google_records = fetch_google(
                    category,
                    api_key,
                    args.google_grid_step,
                    args.google_max_cells,
                    args.sleep_ms,
                )
            except Exception as exc:
                print(f"  [Google] ERROR: {exc}")
        google_counts[category] = len(google_records)

        # Merge: deduplicate by Google place_id, then append OSM-only records.
        # Google records are added last so OSM names (which are often more canonical) lead.
        google_ids: set[str] = {r["google_place_id"] for r in google_records}
        all_records[category].extend(google_records)

        total = len(all_records[category])
        print(f"  Combined: {total} (OSM={osm_counts[category]}, Google={google_counts[category]})")

    # ------------------------------------------------------------------- #
    # Frequency analysis
    # ------------------------------------------------------------------- #
    results: dict[str, Any] = {}
    for category, records in all_records.items():
        raw_counter: Counter[str] = Counter()
        canon_counter: Counter[str] = Counter()
        for rec in records:
            name = str(rec.get("name") or "").strip()
            if not name:
                continue
            raw_counter[name] += 1
            canon = canonicalize(name)
            if canon:
                canon_counter[canon] += 1

        results[category] = {
            "total_records": len(records),
            "osm_records": osm_counts.get(category, 0),
            "google_records": google_counts.get(category, 0),
            "unique_raw_names": len(raw_counter),
            "unique_canonical_names": len(canon_counter),
            "top_raw_names": [
                {"name": n, "count": c} for n, c in raw_counter.most_common(args.top_n)
            ],
            "top_canonical_names": [
                {"name": n, "count": c} for n, c in canon_counter.most_common(args.top_n)
                if n
            ],
        }

    report = {
        "generated_at_unix": int(time.time()),
        "sources": {
            "osm": {
                "used": not args.no_osm,
                "url": OVERPASS_URL,
                "license": "ODbL (Open Database License) – openstreetmap.org/copyright",
            },
            "google_places": {
                "used": not args.no_google,
                "url": GOOGLE_SEARCH_URL,
            },
        },
        "scan_params": {
            "google_grid_step": args.google_grid_step if not args.no_google else None,
            "top_n": args.top_n,
        },
        "categories": results,
    }

    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nReport saved: {out_path}")

    # Pretty-print top-10 summary to console
    for category, res in results.items():
        print(f"\n{'─'*50}")
        print(f"  {category.upper()}  (total={res['total_records']}, OSM={res['osm_records']}, Google={res['google_records']})")
        print(f"  Top {args.top_n} (canonical):")
        for i, entry in enumerate(res["top_canonical_names"][:args.top_n], 1):
            print(f"    {i:2}. {entry['name']:45s}  ({entry['count']}x)")


if __name__ == "__main__":
    main()
