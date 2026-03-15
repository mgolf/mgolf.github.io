from __future__ import annotations

import json
import math
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DATA_PATH = Path("data/minigolf_atlas_germany.json")
REPORT_PATH = Path("data/minigolf_validation_report.json")
SUMMARY_PATH = Path("data/minigolf_atlas_summary.json")
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
API_KEY_PATH = Path("apikey")
USER_AGENT = "gGolf-dataset-validator/1.0"

MAX_WORKERS = 12
TIMEOUT_SECONDS = 20
DISTANCE_THRESHOLD_KM = 2.0


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_api_key() -> str:
    key = API_KEY_PATH.read_text(encoding="utf-8").strip()
    if not key:
        raise RuntimeError("API key file is empty")
    return key


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p = math.pi / 180.0
    dlat = (lat2 - lat1) * p
    dlon = (lon2 - lon1) * p
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def parse_components(components: list[dict[str, Any]]) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for comp in components:
        long_name = comp.get("long_name")
        if not long_name:
            continue
        for t in comp.get("types", []):
            parsed.setdefault(t, long_name)
    return parsed


def build_strict_address_query(record: dict[str, Any]) -> str:
    street_name = (record.get("street_name") or "").strip()
    house_number = (record.get("house_number") or "").strip()
    house_addon = (record.get("house_number_addon") or "").strip()
    street_raw = (record.get("street") or "").strip()
    postcode = (record.get("postcode") or "").strip()
    place = (record.get("place") or "").strip()

    # Prefer raw atlas street string for validation. Structured fields may already be polluted
    # by previous wrong geocoding results (e.g., route names replacing local street names).
    if street_raw:
        street = street_raw
    else:
        street = " ".join(p for p in [street_name, house_number, house_addon] if p).strip()

    parts = [street, " ".join(p for p in [postcode, place] if p).strip(), "Germany"]
    return ", ".join(p for p in parts if p).strip(" ,")


def geocode_query(query: str, api_key: str) -> dict[str, Any]:
    params = urlencode({"address": query, "key": api_key, "region": "de", "language": "de"})
    url = f"{GEOCODE_URL}?{params}"
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
        payload = json.loads(resp.read().decode("utf-8", errors="replace"))

    status = payload.get("status")
    if status != "OK" or not payload.get("results"):
        return {"ok": False, "status": status}

    result = payload["results"][0]
    loc = (result.get("geometry") or {}).get("location") or {}
    comps = parse_components(result.get("address_components") or [])

    return {
        "ok": True,
        "status": status,
        "lat": loc.get("lat"),
        "lng": loc.get("lng"),
        "formatted": result.get("formatted_address"),
        "location_type": (result.get("geometry") or {}).get("location_type"),
        "postal_code": comps.get("postal_code"),
        "route": comps.get("route"),
        "street_number": comps.get("street_number"),
        "locality": comps.get("locality") or comps.get("postal_town") or comps.get("administrative_area_level_3"),
    }


@dataclass
class ValidationResult:
    index: int
    query: str
    valid: bool
    reason: str
    correction_applied: bool
    distance_km: float | None
    strict: dict[str, Any] | None


def validate_one(index: int, record: dict[str, Any], api_key: str) -> ValidationResult:
    # Preserve OSM authority: never replace coordinates for OSM-referenced rows.
    if record.get("osm_id") and record.get("osm_type"):
        return ValidationResult(index, "", True, "protected_osm_coordinates", False, None, None)

    query = build_strict_address_query(record)
    if not query:
        return ValidationResult(index, "", False, "empty_query", False, None, None)

    strict = geocode_query(query, api_key)
    if not strict.get("ok"):
        return ValidationResult(index, query, False, f"strict_geocode_failed:{strict.get('status')}", False, None, strict)

    cur_lat = record.get("latitude")
    cur_lng = record.get("longitude")
    if not isinstance(cur_lat, (int, float)) or not isinstance(cur_lng, (int, float)):
        return ValidationResult(index, query, False, "missing_current_coordinates", False, None, strict)

    new_lat = strict.get("lat")
    new_lng = strict.get("lng")
    if not isinstance(new_lat, (int, float)) or not isinstance(new_lng, (int, float)):
        return ValidationResult(index, query, False, "strict_missing_coordinates", False, None, strict)

    distance = haversine_km(float(cur_lat), float(cur_lng), float(new_lat), float(new_lng))
    record_postcode = (record.get("postcode") or "").strip()
    strict_postcode = (strict.get("postal_code") or "").strip()

    postcode_match = bool(record_postcode and strict_postcode and record_postcode == strict_postcode)

    # conservative correction rule: only fix when strict geocode matches postcode and differs strongly.
    if postcode_match and distance > DISTANCE_THRESHOLD_KM:
        record["latitude"] = float(new_lat)
        record["longitude"] = float(new_lng)
        record["geocode_query"] = query
        record["geocode_display_name"] = strict.get("formatted")
        record["geocode_source"] = "google_geocoding_validated"
        if strict.get("location_type"):
            record["geocode_confidence"] = strict.get("location_type")
        if strict.get("route"):
            record["street_name"] = strict.get("route")
        if strict.get("street_number"):
            record["house_number"] = strict.get("street_number")
        if strict.get("postal_code"):
            record["postcode"] = strict.get("postal_code")
        if strict.get("locality"):
            record["resolved_place"] = strict.get("locality")
        return ValidationResult(index, query, True, "corrected_distance_and_postcode_match", True, distance, strict)

    if distance > DISTANCE_THRESHOLD_KM and not postcode_match:
        return ValidationResult(index, query, False, "distance_high_but_postcode_mismatch", False, distance, strict)

    return ValidationResult(index, query, True, "ok", False, distance, strict)


def main() -> None:
    api_key = read_api_key()
    records: list[dict[str, Any]] = load_json(DATA_PATH, [])
    if not records:
        raise RuntimeError("No records to validate")

    started = time.time()
    corrections = 0
    invalid = 0

    report_rows: list[dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = [pool.submit(validate_one, idx, record, api_key) for idx, record in enumerate(records)]
        for count, future in enumerate(as_completed(futures), start=1):
            result = future.result()
            if result.correction_applied:
                corrections += 1
            if not result.valid:
                invalid += 1

            if result.reason != "ok":
                report_rows.append(
                    {
                        "index": result.index,
                        "reason": result.reason,
                        "query": result.query,
                        "distance_km": result.distance_km,
                        "strict_formatted": (result.strict or {}).get("formatted"),
                        "strict_postcode": (result.strict or {}).get("postal_code"),
                    }
                )

            if count % 200 == 0:
                print(f"Validated {count}/{len(records)} (corrected={corrections}, invalid={invalid})")

    save_json(DATA_PATH, records)

    summary = load_json(SUMMARY_PATH, {})
    summary["validation_last_run_unix"] = int(time.time())
    summary["validation_checked_records"] = len(records)
    summary["validation_corrected_records"] = corrections
    summary["validation_flagged_records"] = invalid
    summary["validation_distance_threshold_km"] = DISTANCE_THRESHOLD_KM
    save_json(SUMMARY_PATH, summary)

    report = {
        "generated_at_unix": int(time.time()),
        "duration_seconds": round(time.time() - started, 2),
        "total_records": len(records),
        "corrections_applied": corrections,
        "invalid_or_flagged": invalid,
        "rows": report_rows,
    }
    save_json(REPORT_PATH, report)

    print(
        f"Validation done. total={len(records)} corrected={corrections} flagged={invalid} "
        f"report={REPORT_PATH}"
    )


if __name__ == "__main__":
    main()
