from __future__ import annotations

import argparse
import json
import re
import time
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
USER_AGENT = "gGolf-google-business-name-frequency/1.0"

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
    "places.types"
)

CATEGORY_QUERIES = {
    "pizzeria": ["pizzeria", "pizza restaurant"],
    "eisdiele": ["eisdiele", "eiscafe", "gelateria"],
    "friseur": ["friseur", "haarsalon", "haarstudio", "barbershop"],
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Analyze frequent business names in Germany via Google Places")
    p.add_argument("--api-key-file", default="apikey")
    p.add_argument("--grid-step", type=float, default=1.3, help="Grid step in degrees (lower = more coverage, more API calls)")
    p.add_argument("--max-cells", type=int, default=0, help="Limit number of grid cells for quick tests")
    p.add_argument("--sleep-ms", type=int, default=90, help="Delay between API calls")
    p.add_argument("--max-results-per-cell", type=int, default=20, help="Google max is 20")
    p.add_argument("--max-pages", type=int, default=3, help="Max paginated result pages per query/cell")
    p.add_argument("--top-n", type=int, default=10)
    p.add_argument("--out", default="data/google_business_name_frequency_report.json")
    return p.parse_args()


def read_api_key(path: Path) -> str:
    value = path.read_text(encoding="utf-8").strip()
    if not value:
        raise RuntimeError("API key file is empty")
    return value


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


def search_text(
    query: str,
    lat: float,
    lng: float,
    api_key: str,
    max_results: int,
    page_token: str | None = None,
) -> dict[str, Any]:
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
    if page_token:
        payload["pageToken"] = page_token

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


def extract_country_code(place: dict[str, Any]) -> str | None:
    for comp in place.get("addressComponents") or []:
        if "country" in (comp.get("types") or []):
            short = comp.get("shortText")
            if short:
                return str(short).upper()
            long_name = comp.get("longText")
            if long_name:
                return str(long_name).upper()
    return None


def is_germany(place: dict[str, Any]) -> bool:
    country_code = extract_country_code(place)
    if country_code == "DE":
        return True
    addr = str(place.get("formattedAddress") or "").lower()
    return "deutschland" in addr or ", germany" in addr or addr.endswith(" germany")


def canonicalize_name(name: str) -> str:
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    text = text.lower().strip()
    # Keep main brand/name, drop common branch suffixes.
    text = re.split(r"\s[-|,:]\s", text, maxsplit=1)[0]
    text = text.replace("&", " und ")
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def main() -> None:
    args = parse_args()
    api_key = read_api_key(Path(args.api_key_file))
    out_path = Path(args.out)

    cells = build_cells(args.grid_step)
    if args.max_cells > 0:
        cells = cells[: args.max_cells]

    print(f"Scanning {len(cells)} grid cells, categories={len(CATEGORY_QUERIES)}")

    # category -> place_id -> record
    places_by_category: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    failures: list[dict[str, Any]] = []
    call_count = 0

    for category, queries in CATEGORY_QUERIES.items():
        print(f"Category: {category} (queries={queries})")
        for query in queries:
            for i, (lat, lng) in enumerate(cells, start=1):
                call_count += 1
                try:
                    data = search_text(query, lat, lng, api_key, args.max_results_per_cell)
                except Exception as exc:
                    failures.append({"category": category, "query": query, "cell": [lat, lng], "error": str(exc)})
                    continue

                page_data = data
                pages_used = 0
                while True:
                    pages_used += 1
                    for place in page_data.get("places") or []:
                        pid = str(place.get("id") or "")
                        name = str((place.get("displayName") or {}).get("text") or "").strip()
                        if not pid or not name:
                            continue
                        if not is_germany(place):
                            continue
                        places_by_category[category][pid] = {
                            "place_id": pid,
                            "name": name,
                            "formatted_address": place.get("formattedAddress"),
                            "types": place.get("types") or [],
                        }

                    next_page = str(page_data.get("nextPageToken") or "").strip()
                    if not next_page or pages_used >= max(1, args.max_pages):
                        break

                    # Places API requires a short wait before a page token becomes valid.
                    time.sleep(1.8)
                    try:
                        call_count += 1
                        page_data = search_text(
                            query,
                            lat,
                            lng,
                            api_key,
                            args.max_results_per_cell,
                            page_token=next_page,
                        )
                    except Exception as exc:
                        failures.append(
                            {
                                "category": category,
                                "query": query,
                                "cell": [lat, lng],
                                "error": f"pagination: {exc}",
                            }
                        )
                        break

                if i % 15 == 0:
                    print(f"  {category}/{query}: {i}/{len(cells)} cells")

                time.sleep(max(0, args.sleep_ms) / 1000)

    top_raw: dict[str, list[dict[str, Any]]] = {}
    top_canonical: dict[str, list[dict[str, Any]]] = {}

    for category, places in places_by_category.items():
        raw_counter = Counter(p["name"].strip() for p in places.values() if p.get("name"))
        canonical_counter = Counter(canonicalize_name(p["name"]) for p in places.values() if p.get("name"))

        top_raw[category] = [
            {"name": name, "count": count}
            for name, count in raw_counter.most_common(max(1, args.top_n))
        ]
        top_canonical[category] = [
            {"name": name, "count": count}
            for name, count in canonical_counter.most_common(max(1, args.top_n))
            if name
        ]

    report = {
        "generated_at_unix": int(time.time()),
        "scan": {
            "grid_step": args.grid_step,
            "cells_scanned_per_query": len(cells),
            "api_calls_total": call_count,
            "max_results_per_cell": args.max_results_per_cell,
            "max_pages": args.max_pages,
            "failures": len(failures),
        },
        "categories": {
            category: {
                "queries": CATEGORY_QUERIES[category],
                "unique_places": len(places_by_category[category]),
                "top_raw_name_counts": top_raw.get(category, []),
                "top_canonical_name_counts": top_canonical.get(category, []),
            }
            for category in CATEGORY_QUERIES
        },
        "failures": failures[:300],
    }

    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print("Done")
    print(f"Report: {out_path}")
    for category in CATEGORY_QUERIES:
        unique_places = report["categories"][category]["unique_places"]
        print(f"{category}: unique_places={unique_places}")


if __name__ == "__main__":
    main()
