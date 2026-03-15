from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
USER_AGENT = "gGolf-google-minigolf-scan/1.0"

DATASET_PATH = Path("data/minigolf_atlas_germany.json")
OUT_CANDIDATES_PATH = Path("data/google_minigolf_germany_candidates.json")
OUT_REPORT_PATH = Path("data/google_minigolf_germany_compare_report.json")

# Germany bounding box (coarse)
LAT_MIN = 47.2
LAT_MAX = 55.1
LNG_MIN = 5.8
LNG_MAX = 15.2

FIELD_MASK = (
    "places.id,"
    "places.displayName,"
    "places.formattedAddress,"
    "places.addressComponents,"
    "places.location,"
    "places.types,"
    "places.rating,"
    "places.userRatingCount,"
    "places.businessStatus,"
    "places.googleMapsUri"
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Collect Google minigolf places in Germany and compare with local dataset")
    p.add_argument("--api-key-file", default="apikey")
    p.add_argument("--grid-step", type=float, default=1.2, help="Grid step in degrees (lower = more coverage, more API calls)")
    p.add_argument("--max-cells", type=int, default=0, help="Limit number of grid cells for test runs")
    p.add_argument("--sleep-ms", type=int, default=120, help="Delay between API calls")
    p.add_argument("--max-results-per-cell", type=int, default=20, help="Google max is 20")
    return p.parse_args()


def read_api_key(path: Path) -> str:
    value = path.read_text(encoding="utf-8").strip()
    if not value:
        raise RuntimeError("API key file is empty")
    return value


def haversine_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    r = 6371.0
    p = math.pi / 180.0
    d_lat = (b_lat - a_lat) * p
    d_lng = (b_lng - a_lng) * p
    x = math.sin(d_lat / 2) ** 2 + math.cos(a_lat * p) * math.cos(b_lat * p) * math.sin(d_lng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(x))


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


def search_text(query: str, lat: float, lng: float, api_key: str, max_results: int) -> dict[str, Any]:
    payload = {
        "textQuery": query,
        "languageCode": "de",
        "regionCode": "DE",
        "maxResultCount": max(1, min(20, max_results)),
        "locationBias": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": 50000.0,
            }
        },
    }

    req = Request(
        SEARCH_URL,
        data=json.dumps(payload).encode("utf-8"),
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


def normalize_google_place(place: dict[str, Any], lat: float, lng: float) -> dict[str, Any]:
    loc = place.get("location") or {}
    country_code = None
    for comp in place.get("addressComponents") or []:
        types = comp.get("types") or []
        if "country" in types:
            country_code = comp.get("shortText") or comp.get("longText")
            break
    return {
        "place_id": place.get("id"),
        "name": (place.get("displayName") or {}).get("text"),
        "formatted_address": place.get("formattedAddress"),
        "country_code": country_code,
        "lat": loc.get("latitude"),
        "lng": loc.get("longitude"),
        "types": place.get("types") or [],
        "rating": place.get("rating"),
        "rating_count": place.get("userRatingCount"),
        "business_status": place.get("businessStatus"),
        "maps_url": place.get("googleMapsUri"),
        "query_cell_lat": lat,
        "query_cell_lng": lng,
    }


def is_germany_address(formatted_address: str | None) -> bool:
    if not formatted_address:
        return False
    text = formatted_address.lower()
    return (
        "deutschland" in text
        or ", germany" in text
        or text.endswith(" germany")
    )


def main() -> None:
    args = parse_args()
    api_key = read_api_key(Path(args.api_key_file))

    cells = build_cells(args.grid_step)
    if args.max_cells > 0:
        cells = cells[: args.max_cells]

    print(f"Scanning Google Places with {len(cells)} grid cells (step={args.grid_step})...")

    raw_results: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

    for i, (lat, lng) in enumerate(cells, start=1):
        try:
            data = search_text("minigolf", lat, lng, api_key, args.max_results_per_cell)
        except Exception as exc:
            failures.append({"cell": [lat, lng], "error": str(exc)})
            continue

        places = data.get("places") or []
        for place in places:
            normalized = normalize_google_place(place, lat, lng)
            if normalized.get("place_id") and isinstance(normalized.get("lat"), (int, float)) and isinstance(normalized.get("lng"), (int, float)):
                raw_results.append(normalized)

        if i % 10 == 0:
            print(f"  processed {i}/{len(cells)} cells, collected {len(raw_results)} raw places")

        time.sleep(max(0, args.sleep_ms) / 1000)

    by_id: dict[str, dict[str, Any]] = {}
    for place in raw_results:
        pid = str(place.get("place_id") or "")
        if not pid:
            continue
        by_id[pid] = place

    candidates = [
        p
        for p in by_id.values()
        if str(p.get("country_code") or "").upper() == "DE" or is_germany_address(p.get("formatted_address"))
    ]

    dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    dataset_place_ids = {str(r.get("venue_google_place_id") or "") for r in dataset if r.get("venue_google_place_id")}

    dataset_coords = [
        (float(r["latitude"]), float(r["longitude"]), r)
        for r in dataset
        if isinstance(r.get("latitude"), (int, float)) and isinstance(r.get("longitude"), (int, float))
    ]

    unmatched_by_place_id: list[dict[str, Any]] = []
    matched_by_place_id = 0
    unmatched_by_place_id_but_near_dataset = 0

    for p in candidates:
        if p["place_id"] in dataset_place_ids:
            matched_by_place_id += 1
            continue

        nearest_km = None
        nearest_row = None
        for lat, lng, row in dataset_coords:
            d = haversine_km(float(p["lat"]), float(p["lng"]), lat, lng)
            if nearest_km is None or d < nearest_km:
                nearest_km = d
                nearest_row = row

        if nearest_km is not None and nearest_km <= 0.20:
            unmatched_by_place_id_but_near_dataset += 1

        unmatched_by_place_id.append(
            {
                **p,
                "nearest_dataset_distance_km": round(nearest_km, 3) if nearest_km is not None else None,
                "nearest_dataset_name": nearest_row.get("venue_name") if nearest_row else None,
                "nearest_dataset_postcode": nearest_row.get("postcode") if nearest_row else None,
                "nearest_dataset_place": nearest_row.get("place") if nearest_row else None,
            }
        )

    unmatched_by_place_id.sort(
        key=lambda x: (x.get("nearest_dataset_distance_km") is None, x.get("nearest_dataset_distance_km") or 9999)
    )

    OUT_CANDIDATES_PATH.write_text(json.dumps(candidates, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    report = {
        "generated_at_unix": int(time.time()),
        "scan": {
            "grid_step": args.grid_step,
            "cells_scanned": len(cells),
            "raw_results": len(raw_results),
            "unique_google_places": len(candidates),
            "failures": len(failures),
        },
        "comparison": {
            "dataset_total_rows": len(dataset),
            "dataset_rows_with_google_place_id": len(dataset_place_ids),
            "google_places_matched_by_place_id": matched_by_place_id,
            "google_places_not_matched_by_place_id": len(unmatched_by_place_id),
            "unmatched_but_within_200m_of_existing_dataset": unmatched_by_place_id_but_near_dataset,
            "likely_new_candidates": len(unmatched_by_place_id) - unmatched_by_place_id_but_near_dataset,
        },
        "unmatched_examples": unmatched_by_place_id[:200],
        "failures": failures[:200],
    }

    OUT_REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print("Done.")
    print(f"unique_google_places={len(candidates)}")
    print(f"matched_by_place_id={matched_by_place_id}")
    print(f"unmatched_by_place_id={len(unmatched_by_place_id)}")
    print(f"likely_new_candidates={report['comparison']['likely_new_candidates']}")
    print(f"report={OUT_REPORT_PATH}")


if __name__ == "__main__":
    main()
