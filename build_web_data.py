from __future__ import annotations

import hashlib
import json
import math
import re
import time
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

INPUT_PATH = Path("data/minigolf_atlas_germany.json")
OUTPUT_PATH = Path("data/venues-webapp.json")
BOOTSTRAP_PATH = Path("data/venues-bootstrap.json")
MARKERS_PATH = Path("data/venues-markers.json")
WEBAPP_DATA_DIR = Path("webapp/public/data")

MINIGOLF_RE = re.compile(r"\b(mini\s?-?golf|abenteuergolf|adventure\s?golf|pit\s?pat|golfanlage)\b", re.IGNORECASE)


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _address_fallback_label(record: dict[str, Any]) -> str:
    address = (record.get("street") or "").strip()
    place = " ".join(p for p in [record.get("postcode", ""), record.get("place", "")] if p).strip()
    fallback = ", ".join([p for p in [address, place] if p]).strip()
    return fallback or "Minigolf Venue"


def pick_source_name(record: dict[str, Any]) -> str:
    # Keep atlas/source identity as canonical; treat Google place name as linked reference.
    # For atlas-derived rows where Google is only a nearby reference, avoid using
    # the nearby POI's name as venue title and fall back to neutral atlas/address labels.
    if record.get("source_plz_group") != "osm" and record.get("venue_google_place_id"):
        relation_kind, _ = infer_google_relation(record)
        if relation_kind == "nearby_reference":
            return _address_fallback_label(record)

    candidate = (record.get("venue_name") or "").strip()
    if candidate and (record.get("detail_url") or MINIGOLF_RE.search(candidate)):
        return candidate

    if record.get("detail_url") and record.get("detail_facility_type"):
        facility = str(record.get("detail_facility_type")).strip()
        if facility:
            return facility

    return _address_fallback_label(record)


def infer_google_relation(record: dict[str, Any]) -> tuple[str | None, str | None]:
    if not record.get("venue_google_place_id"):
        return None, None

    text = " ".join([
        str(record.get("venue_name", "")),
        str(record.get("venue_category", "")),
        str(record.get("venue_address_google", "")),
    ]).lower()

    if MINIGOLF_RE.search(text):
        return "onsite_or_probable", "google_place_looks_like_minigolf"

    return "nearby_reference", "google_place_is_nearby_or_generic_poi"


def stable_id(record: dict[str, Any]) -> str:
    raw = "|".join(
        [
            str(record.get("postcode", "")),
            str(record.get("place", "")),
            str(record.get("street", "")),
            str(record.get("source_url", "")),
            str(record.get("detail_url", "")),
        ]
    )
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]
    return f"venue_{digest}"


def coordinate_source_info(record: dict[str, Any]) -> dict[str, Any]:
    raw_geocode_source = record.get("geocode_source") or None
    has_osm_reference = bool(record.get("osm_id") and record.get("osm_type"))

    if has_osm_reference:
        return {
            "authority": "osm",
            "label": "OSM",
            "raw_geocode_source": raw_geocode_source,
        }

    mapping = {
        "nominatim": "Nominatim",
        "google_geocoding": "Google Geocoding",
        "google_geocoding_validated": "Google Geocoding",
        "atlas_position_verified_with_google_and_osm": "Atlas verifiziert",
        "atlas_position_corrected_from_osm": "Atlas aus OSM korrigiert",
        "google_places_scan": "Google Places Scan",
        "user_invalidated_phantom_marker": "Invalidiert",
    }
    label = mapping.get(str(raw_geocode_source), str(raw_geocode_source) if raw_geocode_source else None)
    return {
        "authority": raw_geocode_source,
        "label": label,
        "raw_geocode_source": raw_geocode_source,
    }


def enforce_unique_ids(venues: list[dict[str, Any]]) -> None:
    seen: dict[str, int] = {}
    used: set[str] = set()

    for idx, venue in enumerate(venues):
        base_id = str(venue.get("id") or f"venue_row_{idx}")
        count = seen.get(base_id, 0)
        seen[base_id] = count + 1

        if count == 0 and base_id not in used:
            venue["id"] = base_id
            used.add(base_id)
            continue

        # Deterministic suffix for collisions while keeping the original ID recognizable.
        payload = "|".join(
            [
                base_id,
                str(idx),
                str(venue.get("name") or ""),
                str((venue.get("coordinates") or {}).get("lat") or ""),
                str((venue.get("coordinates") or {}).get("lng") or ""),
                str(((venue.get("address") or {}).get("postcode")) or ""),
            ]
        )
        digest = hashlib.sha1(payload.encode("utf-8")).hexdigest()[:8]
        candidate = f"{base_id}_{count + 1}_{digest}"
        while candidate in used:
            digest = hashlib.sha1((payload + candidate).encode("utf-8")).hexdigest()[:8]
            candidate = f"{base_id}_{count + 1}_{digest}"

        venue["id"] = candidate
        used.add(candidate)


def pick_website(record: dict[str, Any]) -> str | None:
    return record.get("venue_website") or record.get("detail_website") or None


def pick_phone(record: dict[str, Any]) -> str | None:
    return record.get("venue_phone") or record.get("detail_phone") or None


def sanitize_url(url: str | None) -> str | None:
    if not url:
        return None
    parsed = urlparse(url)
    query = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k.lower() != "key"]
    return urlunparse(parsed._replace(query=urlencode(query)))


def haversine_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    radius = 6371.0
    p = math.pi / 180.0
    d_lat = (b_lat - a_lat) * p
    d_lng = (b_lng - a_lng) * p
    x = math.sin(d_lat / 2) ** 2 + math.cos(a_lat * p) * math.cos(b_lat * p) * math.sin(d_lng / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(x))


def format_trusted_address(venue: dict[str, Any]) -> str | None:
    addr = venue.get("address") or {}
    line1 = " ".join(p for p in [addr.get("street_name"), addr.get("house_number")] if p).strip()
    line2 = " ".join(p for p in [addr.get("postcode"), addr.get("place")] if p).strip()
    if line1 and line2:
        return f"{line1}, {line2}"
    return line2 or line1 or None


def has_usable_primary_address(venue: dict[str, Any]) -> bool:
    addr = venue.get("address") or {}
    return bool(addr.get("street_name") and (addr.get("postcode") or addr.get("place")))


def normalize_record(record: dict[str, Any]) -> dict[str, Any]:
    lat = record.get("latitude")
    lng = record.get("longitude")
    relation_kind, relation_reason = infer_google_relation(record)
    coord_source = coordinate_source_info(record)

    return {
        "id": stable_id(record),
        "name": pick_source_name(record),
        "coordinates": {
            "lat": lat,
            "lng": lng,
            "source": coord_source,
        },
        "address": {
            "street_name": record.get("street_name") or None,
            "house_number": record.get("house_number") or None,
            "house_number_addon": record.get("house_number_addon") or None,
            "postcode": record.get("postcode") or None,
            "place": record.get("place") or None,
            "country": record.get("country") or "Germany",
            "country_code": record.get("country_code") or "DE",
            "raw": {
                "location": record.get("location") or None,
                "street": record.get("street") or None,
                "geocode_display_name": record.get("geocode_display_name") or None,
            },
        },
        "classification": {
            "course_types": record.get("course_types") or [],
            "approved_course_types": record.get("approved_course_types") or [],
            "accepts_minigolf_card": bool(record.get("accepts_minigolf_card")),
            "has_club": bool(record.get("has_club")),
            "venue_category": record.get("venue_category") or None,
        },
        "contact": {
            "website": pick_website(record),
            "phone": pick_phone(record),
            "email": record.get("detail_email") or None,
        },
        "links": {
            "detail_url": record.get("detail_url") or None,
            "source_url": record.get("source_url") or None,
            "google_maps_url": record.get("venue_google_maps_url") or None,
            "photo_url": sanitize_url(record.get("venue_photo_url")),
        },
        "google": {
            "place_id": record.get("venue_google_place_id") or None,
            "place_name": record.get("venue_name") if record.get("venue_google_place_id") else None,
            "place_types": (record.get("venue_category") or None),
            "rating": record.get("venue_google_rating"),
            "rating_count": record.get("venue_google_rating_count"),
            "business_status": record.get("venue_business_status") or None,
            "opening_hours_text": record.get("venue_opening_hours_google") or None,
            "address": record.get("venue_address_google") or None,
            "relation": {
                "kind": relation_kind,
                "reason": relation_reason,
            },
        },
        "detail": {
            "address": record.get("detail_address") or None,
            "phone": record.get("detail_phone") or None,
            "fax": record.get("detail_fax") or None,
            "website": record.get("detail_website") or None,
            "email": record.get("detail_email") or None,
            "opening_hours": record.get("detail_opening_hours") or None,
            "facility_type": record.get("detail_facility_type") or None,
            "additional_offers": record.get("detail_additional_offers") or None,
        },
        "source": {
            "plz_group": record.get("source_plz_group") or None,
            "geocode_source": record.get("geocode_source") or None,
            "geocode_query": record.get("geocode_query") or None,
            "coordinate_source": coord_source,
            "osm": {
                "id": record.get("osm_id") or None,
                "type": record.get("osm_type") or None,
                "class": record.get("osm_class") or None,
            },
        },
    }


def marker_record(venue: dict[str, Any]) -> dict[str, Any]:
    google_relation = venue.get("google", {}).get("relation") or {}
    relation_kind = google_relation.get("kind")
    google_place_name = venue.get("google", {}).get("place_name")
    coord_source = (venue.get("coordinates") or {}).get("source") or {}

    return {
        "id": venue["id"],
        "name": venue["name"],
        "lat": venue["coordinates"]["lat"],
        "lng": venue["coordinates"]["lng"],
        "coordinate_source_authority": coord_source.get("authority"),
        "coordinate_source_label": coord_source.get("label"),
        "coordinate_source_raw": coord_source.get("raw_geocode_source"),
        "source_plz_group": (venue.get("source") or {}).get("plz_group"),
        "has_osm_reference": bool(((venue.get("source") or {}).get("osm") or {}).get("id")),
        "place": venue["address"]["place"],
        "postcode": venue["address"]["postcode"],
        "course_types": venue["classification"]["course_types"],
        "accepts_minigolf_card": venue["classification"]["accepts_minigolf_card"],
        "rating": venue["google"]["rating"],
        "google_relation_kind": relation_kind,
        "google_poi_name": google_place_name if relation_kind == "nearby_reference" else None,
    }


def build_marker_records(venues: list[dict[str, Any]]) -> list[dict[str, Any]]:
    markers: list[dict[str, Any]] = []

    # Trusted address pool = OSM entries that have coordinates and a usable address label.
    trusted_osm_pool: list[dict[str, Any]] = []
    for venue in venues:
        if (venue.get("source") or {}).get("plz_group") != "osm":
            continue
        coords = venue.get("coordinates") or {}
        lat = coords.get("lat")
        lng = coords.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            continue
        label = format_trusted_address(venue)
        if not label:
            continue
        trusted_osm_pool.append({"lat": float(lat), "lng": float(lng), "label": label})

    for venue in venues:
        coords = venue.get("coordinates") or {}
        lat = coords.get("lat")
        lng = coords.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            continue

        marker = marker_record(venue)

        # Atlas records stay primary. If atlas has no usable address, add a nearby trusted
        # OSM address relation as a hint. Position (lat/lng) remains unchanged.
        source_plz_group = (venue.get("source") or {}).get("plz_group")
        if source_plz_group and source_plz_group != "osm" and not has_usable_primary_address(venue):
            nearest_dist = None
            nearest_label = None
            for ref in trusted_osm_pool:
                dist = haversine_km(float(lat), float(lng), ref["lat"], ref["lng"])
                if nearest_dist is None or dist < nearest_dist:
                    nearest_dist = dist
                    nearest_label = ref["label"]
            if nearest_dist is not None and nearest_label and nearest_dist <= 2.0:
                marker["nearby_trusted_address"] = nearest_label
                marker["nearby_trusted_distance_km"] = round(nearest_dist, 3)

        markers.append(marker)

    return markers


def bootstrap_payload(venues: list[dict[str, Any]], stats: dict[str, Any]) -> dict[str, Any]:
    with_coords = [v for v in venues if v["coordinates"]["lat"] is not None and v["coordinates"]["lng"] is not None]

    lat_min = min(v["coordinates"]["lat"] for v in with_coords)
    lat_max = max(v["coordinates"]["lat"] for v in with_coords)
    lng_min = min(v["coordinates"]["lng"] for v in with_coords)
    lng_max = max(v["coordinates"]["lng"] for v in with_coords)

    by_type: dict[str, int] = {}
    for v in venues:
        for t in v["classification"]["course_types"]:
            by_type[t] = by_type.get(t, 0) + 1

    return {
        "schema_version": "1.0.0",
        "generated_at_unix": int(time.time()),
        "total_venues": len(venues),
        "stats": stats,
        "bounds": {
            "lat_min": lat_min,
            "lat_max": lat_max,
            "lng_min": lng_min,
            "lng_max": lng_max,
        },
        "counts": {
            "by_course_type": by_type,
        },
    }


def main() -> None:
    records: list[dict[str, Any]] = load_json(INPUT_PATH, [])
    if not records:
        raise RuntimeError(f"No records found in {INPUT_PATH}")

    venues = [normalize_record(r) for r in records]
    enforce_unique_ids(venues)

    with_coordinates = sum(1 for v in venues if v["coordinates"]["lat"] is not None and v["coordinates"]["lng"] is not None)
    with_google_place = sum(1 for v in venues if v["google"]["place_id"])
    with_photo = sum(1 for v in venues if v["links"]["photo_url"])
    with_google_onsite = sum(1 for v in venues if (v["google"].get("relation") or {}).get("kind") == "onsite_or_probable")
    with_google_nearby = sum(1 for v in venues if (v["google"].get("relation") or {}).get("kind") == "nearby_reference")
    stats = {
        "with_coordinates": with_coordinates,
        "with_google_place": with_google_place,
        "with_photo": with_photo,
        "with_google_onsite_or_probable": with_google_onsite,
        "with_google_nearby_reference": with_google_nearby,
    }

    payload = {
        "schema_version": "1.0.0",
        "generated_at_unix": int(time.time()),
        "source": str(INPUT_PATH),
        "total_venues": len(venues),
        "stats": stats,
        "venues": venues,
    }

    markers = {
        "schema_version": "1.0.0",
        "generated_at_unix": int(time.time()),
        "total_venues": len(venues),
        "markers": build_marker_records(venues),
    }

    bootstrap = bootstrap_payload(venues, stats)

    save_json(OUTPUT_PATH, payload)
    save_json(MARKERS_PATH, markers)
    save_json(BOOTSTRAP_PATH, bootstrap)

    WEBAPP_DATA_DIR.mkdir(parents=True, exist_ok=True)
    save_json(WEBAPP_DATA_DIR / OUTPUT_PATH.name, payload)
    save_json(WEBAPP_DATA_DIR / MARKERS_PATH.name, markers)
    save_json(WEBAPP_DATA_DIR / BOOTSTRAP_PATH.name, bootstrap)

    print(
        f"Wrote {OUTPUT_PATH} with {len(venues)} venues "
        f"(coords={with_coordinates}, google_place={with_google_place}, photos={with_photo})"
    )
    print(f"Wrote {MARKERS_PATH} with {len(markers['markers'])} markers")
    print(f"Wrote {BOOTSTRAP_PATH}")
    print(f"Updated {WEBAPP_DATA_DIR}")


if __name__ == "__main__":
    main()
