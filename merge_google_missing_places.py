from __future__ import annotations

import hashlib
import json
import math
import re
import time
from pathlib import Path
from typing import Any

DATASET_PATH = Path("data/minigolf_atlas_germany.json")
CANDIDATES_PATH = Path("data/google_minigolf_germany_candidates.json")
REPORT_PATH = Path("data/google_merge_report.json")


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def haversine_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    r = 6371.0
    p = math.pi / 180.0
    d_lat = (b_lat - a_lat) * p
    d_lng = (b_lng - a_lng) * p
    x = math.sin(d_lat / 2) ** 2 + math.cos(a_lat * p) * math.cos(b_lat * p) * math.sin(d_lng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(x))


def parse_postcode_place(formatted_address: str | None) -> tuple[str, str]:
    if not formatted_address:
        return "", ""

    # Example: "Seestraße 1, 12345 Berlin, Deutschland"
    m = re.search(r"\b(\d{5})\s+([^,]+)", formatted_address)
    if not m:
        return "", ""
    return m.group(1).strip(), m.group(2).strip()


def stable_source_url_id(source_url: str, name: str, lat: float, lng: float) -> str:
    raw = f"{source_url}|{name}|{lat:.7f}|{lng:.7f}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def is_strict_minigolf_candidate(c: dict[str, Any]) -> bool:
    types = [str(t).lower() for t in (c.get("types") or [])]
    return any(t in types for t in ["miniature_golf", "miniature_golf_course"])


def main() -> None:
    rows: list[dict[str, Any]] = load_json(DATASET_PATH, [])
    candidates: list[dict[str, Any]] = load_json(CANDIDATES_PATH, [])

    if not rows:
        raise RuntimeError("Dataset is empty")
    if not candidates:
        raise RuntimeError("Google candidates file is empty")

    existing_place_ids = {str(r.get("venue_google_place_id") or "") for r in rows if r.get("venue_google_place_id")}

    existing_coords = [
        (float(r["latitude"]), float(r["longitude"]), r)
        for r in rows
        if isinstance(r.get("latitude"), (int, float)) and isinstance(r.get("longitude"), (int, float))
    ]

    added = []
    skipped = {
        "non_minigolf_type": 0,
        "missing_coordinates": 0,
        "already_has_google_place_id": 0,
        "near_existing_within_200m": 0,
    }

    for c in candidates:
        if not is_strict_minigolf_candidate(c):
            skipped["non_minigolf_type"] += 1
            continue

        pid = str(c.get("place_id") or "")
        lat = c.get("lat")
        lng = c.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            skipped["missing_coordinates"] += 1
            continue

        if pid and pid in existing_place_ids:
            skipped["already_has_google_place_id"] += 1
            continue

        nearest_km = None
        for rl, rg, _ in existing_coords:
            d = haversine_km(float(lat), float(lng), rl, rg)
            if nearest_km is None or d < nearest_km:
                nearest_km = d

        if nearest_km is not None and nearest_km <= 0.20:
            skipped["near_existing_within_200m"] += 1
            continue

        postcode, place = parse_postcode_place(c.get("formatted_address"))
        source_url = c.get("maps_url") or f"https://maps.google.com/?q={lat},{lng}"

        record = {
            "postcode": postcode or "",
            "place": place or "",
            "location_raw": f"{postcode} {place}".strip(),
            "address_raw": c.get("formatted_address") or "",
            "accepts_minigolf_card": False,
            "has_club": False,
            "course_types": ["unknown"],
            "approved_course_types": [],
            "detail_url": None,
            "source_plz_group": "google_scan",
            "source_url": source_url,
            "place_raw": place or "",
            "place_addon": "",
            "street_name": "",
            "house_number": "",
            "house_number_addon": "",
            "address_extra": "",
            "address_type": "formatted_address",
            "resolved_place": place or "",
            "district": "",
            "state": "",
            "county": "",
            "country": "Germany",
            "country_code": "DE",
            "latitude": float(lat),
            "longitude": float(lng),
            "geocode_query": None,
            "geocode_display_name": c.get("formatted_address"),
            "geocode_source": "google_places_scan",
            "venue_name": c.get("name") or "Minigolf",
            "venue_category": ",".join(c.get("types") or []) or "miniature_golf",
            "venue_website": None,
            "venue_phone": None,
            "venue_opening_hours": None,
            "venue_wikipedia": None,
            "venue_wikidata": None,
            "osm_id": None,
            "osm_type": None,
            "osm_class": None,
            "detail_address": None,
            "detail_phone": None,
            "detail_fax": None,
            "detail_website": None,
            "detail_email": None,
            "detail_opening_hours": None,
            "detail_facility_type": None,
            "detail_additional_offers": None,
            "venue_google_rating": c.get("rating"),
            "venue_google_rating_count": c.get("rating_count"),
            "venue_business_status": c.get("business_status"),
            "venue_google_maps_url": c.get("maps_url"),
            "venue_address_google": c.get("formatted_address"),
            "venue_google_place_id": pid or None,
            "venue_opening_hours_google": None,
            "venue_photo_url": None,
            "google_scan_id": stable_source_url_id(source_url, str(c.get("name") or "Minigolf"), float(lat), float(lng)),
        }

        rows.append(record)
        existing_coords.append((float(lat), float(lng), record))
        if pid:
            existing_place_ids.add(pid)

        added.append(
            {
                "venue_name": record["venue_name"],
                "postcode": record["postcode"],
                "place": record["place"],
                "lat": record["latitude"],
                "lng": record["longitude"],
                "google_place_id": record["venue_google_place_id"],
            }
        )

    save_json(DATASET_PATH, rows)
    save_json(
        REPORT_PATH,
        {
            "generated_at_unix": int(time.time()),
            "dataset_total_after_merge": len(rows),
            "added_count": len(added),
            "skipped": skipped,
            "added_examples": added[:200],
        },
    )

    print(f"Added {len(added)} new places from Google candidates")
    print(f"Skipped: {skipped}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
