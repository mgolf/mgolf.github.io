from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DATA_PATH = Path("data/minigolf_atlas_germany.json")
SUMMARY_PATH = Path("data/minigolf_atlas_summary.json")
REPORT_PATH = Path("data/osm_minigolf_import_report.json")
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "gGolf-osm-minigolf-import/1.0"
DISTANCE_THRESHOLD_KM = 0.35


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p = math.pi / 180.0
    dlat = (lat2 - lat1) * p
    dlon = (lon2 - lon1) * p
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def normalize_name(value: str | None) -> str:
    if not value:
        return ""
    lowered = value.lower()
    return "".join(ch for ch in lowered if ch.isalnum())


def fetch_overpass() -> list[dict[str, Any]]:
    query = """
[out:json][timeout:300];
area["ISO3166-1"="DE"][admin_level=2]->.searchArea;
(
  nwr(area.searchArea)["leisure"="miniature_golf"];
  nwr(area.searchArea)["sport"="miniature_golf"];
  nwr(area.searchArea)["amenity"="miniature_golf"];
);
out center tags;
""".strip()
    body = urlencode({"data": query}).encode("utf-8")
    req = Request(
        OVERPASS_URL,
        data=body,
        method="POST",
        headers={"User-Agent": USER_AGENT, "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
    )
    with urlopen(req, timeout=360) as resp:
        payload = json.loads(resp.read().decode("utf-8", errors="replace"))
    return payload.get("elements") or []


def element_coords(el: dict[str, Any]) -> tuple[float | None, float | None]:
    if isinstance(el.get("lat"), (int, float)) and isinstance(el.get("lon"), (int, float)):
        return float(el["lat"]), float(el["lon"])
    center = el.get("center") or {}
    if isinstance(center.get("lat"), (int, float)) and isinstance(center.get("lon"), (int, float)):
        return float(center["lat"]), float(center["lon"])
    return None, None


def build_osm_url(el: dict[str, Any]) -> str:
    osm_type = str(el.get("type") or "")
    osm_id = str(el.get("id") or "")
    type_map = {"node": "node", "way": "way", "relation": "relation"}
    mapped = type_map.get(osm_type, "node")
    return f"https://www.openstreetmap.org/{mapped}/{osm_id}"


def pick_place(tags: dict[str, Any]) -> str:
    for key in ("addr:city", "addr:town", "addr:village", "addr:municipality", "addr:hamlet", "addr:suburb"):
        value = tags.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def to_record(el: dict[str, Any]) -> dict[str, Any] | None:
    tags = el.get("tags") or {}
    if not isinstance(tags, dict):
        tags = {}
    lat, lng = element_coords(el)
    if lat is None or lng is None:
        return None

    postcode = str(tags.get("addr:postcode") or "").strip()
    place = pick_place(tags)
    street_name = str(tags.get("addr:street") or "").strip()
    house_number = str(tags.get("addr:housenumber") or "").strip()
    house_number_addon = str(tags.get("addr:unit") or "").strip()
    street = " ".join(p for p in [street_name, house_number, house_number_addon] if p).strip()
    location = " ".join(p for p in [postcode, place] if p).strip()
    name = str(tags.get("name") or "").strip() or "Minigolf"
    osm_type = str(el.get("type") or "")
    osm_id = str(el.get("id") or "")

    return {
        "postcode": postcode,
        "place": place,
        "location": location,
        "street": street,
        "accepts_minigolf_card": False,
        "has_club": False,
        "course_types": ["unknown"],
        "approved_course_types": [],
        "detail_url": None,
        "source_plz_group": "osm",
        "source_url": build_osm_url(el),
        "street_name": street_name,
        "house_number": house_number,
        "house_number_addon": house_number_addon,
        "resolved_place": place,
        "district": str(tags.get("addr:suburb") or "").strip(),
        "state": "",
        "county": "",
        "country": "Germany",
        "country_code": "DE",
        "latitude": lat,
        "longitude": lng,
        "geocode_query": None,
        "geocode_display_name": None,
        "geocode_source": "osm_overpass",
        "venue_name": name,
        "venue_category": "miniature_golf",
        "venue_website": str(tags.get("website") or tags.get("contact:website") or "").strip() or None,
        "venue_phone": str(tags.get("phone") or tags.get("contact:phone") or "").strip() or None,
        "venue_opening_hours": str(tags.get("opening_hours") or "").strip() or None,
        "venue_wikipedia": str(tags.get("wikipedia") or "").strip() or None,
        "venue_wikidata": str(tags.get("wikidata") or "").strip() or None,
        "osm_id": osm_id,
        "osm_type": osm_type,
        "osm_class": str(el.get("tags", {}).get("leisure") or el.get("tags", {}).get("amenity") or "miniature_golf"),
        "detail_address": None,
        "detail_phone": None,
        "detail_fax": None,
        "detail_website": None,
        "detail_email": None,
        "detail_opening_hours": None,
        "detail_facility_type": None,
        "detail_additional_offers": None,
    }


def find_existing_match(
    candidate: dict[str, Any], existing: list[dict[str, Any]], seen_osm: set[tuple[str, str]]
) -> tuple[dict[str, Any] | None, str]:
    """Return (matching_record_or_None, reason)."""
    cand_osm_id = str(candidate.get("osm_id") or "")
    cand_osm_type = str(candidate.get("osm_type") or "")
    if cand_osm_id and cand_osm_type and (cand_osm_type, cand_osm_id) in seen_osm:
        # Find the actual record so we can still enrich it
        for row in existing:
            if str(row.get("osm_type") or "") == cand_osm_type and str(row.get("osm_id") or "") == cand_osm_id:
                return row, "same_osm_object"
        return None, "same_osm_object"  # already tracked but record not found (shouldn't happen)

    cand_name = normalize_name(candidate.get("venue_name"))
    cand_postcode = str(candidate.get("postcode") or "").strip()
    cand_lat = candidate.get("latitude")
    cand_lng = candidate.get("longitude")
    if not isinstance(cand_lat, (int, float)) or not isinstance(cand_lng, (int, float)):
        return None, "missing_coordinates"

    best_dist: float | None = None
    best_row: dict[str, Any] | None = None

    for row in existing:
        lat = row.get("latitude")
        lng = row.get("longitude")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            continue
        dist = haversine_km(float(cand_lat), float(cand_lng), float(lat), float(lng))
        if dist <= DISTANCE_THRESHOLD_KM:
            if best_dist is None or dist < best_dist:
                best_dist = dist
                best_row = row
            continue

        if cand_postcode and cand_postcode == str(row.get("postcode") or "").strip():
            row_name = normalize_name(row.get("venue_name"))
            if cand_name and row_name and cand_name == row_name:
                return row, "name_postcode_match"

    if best_row is not None:
        return best_row, f"distance_match:{best_dist:.3f}km"

    return None, "new"


# Fields from OSM that can enrich an existing Atlas entry when currently missing
OSM_ENRICH_FIELDS: list[str] = [
    "osm_id", "osm_type", "osm_class",
    "venue_opening_hours",
    "venue_website", "venue_phone",
    "venue_wikipedia", "venue_wikidata",
    "postcode", "place", "resolved_place",
    "street_name", "house_number", "house_number_addon",
    "district", "state", "county",
]


def enrich_record(existing: dict[str, Any], osm: dict[str, Any]) -> int:
    """Fill in missing fields in *existing* from *osm*. Returns number of fields updated."""
    updated = 0
    for field in OSM_ENRICH_FIELDS:
        osm_value = osm.get(field)
        if osm_value and not existing.get(field):
            existing[field] = osm_value
            updated += 1
    return updated


def refresh_summary(records: list[dict[str, Any]], previous: dict[str, Any], added_count: int, overpass_count: int, enriched_count: int = 0) -> dict[str, Any]:
    summary = dict(previous)
    summary["total_records"] = len(records)
    summary["records_with_coordinates"] = sum(
        1 for r in records if isinstance(r.get("latitude"), (int, float)) and isinstance(r.get("longitude"), (int, float))
    )
    summary["records_with_venue_name"] = sum(1 for r in records if bool((r.get("venue_name") or "").strip()))
    summary["osm_overpass_candidates"] = overpass_count
    summary["osm_records_added"] = (summary.get("osm_records_added") or 0) + added_count
    summary["osm_records_enriched"] = (summary.get("osm_records_enriched") or 0) + enriched_count
    summary["osm_last_import_unix"] = int(time.time())
    return summary


def main() -> None:
    records: list[dict[str, Any]] = load_json(DATA_PATH, [])
    if not records:
        raise RuntimeError(f"No records found in {DATA_PATH}")

    existing_osm: set[tuple[str, str]] = set()
    for row in records:
        osm_type = str(row.get("osm_type") or "")
        osm_id = str(row.get("osm_id") or "")
        if osm_type and osm_id:
            existing_osm.add((osm_type, osm_id))

    elements = fetch_overpass()
    added: list[dict[str, Any]] = []
    enriched: list[dict[str, Any]] = []
    skipped: dict[str, int] = {}

    for el in elements:
        record = to_record(el)
        if record is None:
            skipped["invalid_or_missing_coordinates"] = skipped.get("invalid_or_missing_coordinates", 0) + 1
            continue
        match_row, reason = find_existing_match(record, records, existing_osm)
        if match_row is not None:
            # Enrich the existing record with any OSM data it's missing
            fields_updated = enrich_record(match_row, record)
            if fields_updated > 0:
                enriched.append({"venue_name": match_row.get("venue_name"), "reason": reason, "fields": fields_updated})
            skipped[reason] = skipped.get(reason, 0) + 1
            # Ensure the OSM id is tracked so we don't process the same OSM object twice
            if record.get("osm_type") and record.get("osm_id"):
                existing_osm.add((str(record["osm_type"]), str(record["osm_id"])))
            continue
        records.append(record)
        added.append(record)
        if record.get("osm_type") and record.get("osm_id"):
            existing_osm.add((str(record["osm_type"]), str(record["osm_id"])))

    save_json(DATA_PATH, records)
    previous_summary = load_json(SUMMARY_PATH, {})
    save_json(SUMMARY_PATH, refresh_summary(records, previous_summary, len(added), len(elements), len(enriched)))
    save_json(
        REPORT_PATH,
        {
            "generated_at_unix": int(time.time()),
            "overpass_candidates": len(elements),
            "added": len(added),
            "enriched": len(enriched),
            "skipped": skipped,
            "distance_threshold_km": DISTANCE_THRESHOLD_KM,
            "added_examples": [
                {
                    "venue_name": r.get("venue_name"),
                    "postcode": r.get("postcode"),
                    "place": r.get("place"),
                    "source_url": r.get("source_url"),
                }
                for r in added[:25]
            ],
            "enriched_examples": enriched[:25],
        },
    )
    print(f"OSM import done: candidates={len(elements)} added={len(added)} enriched={len(enriched)}")


if __name__ == "__main__":
    main()
