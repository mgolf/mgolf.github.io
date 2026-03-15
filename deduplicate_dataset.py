"""
deduplicate_dataset.py
----------------------
Cleans minigolf_atlas_germany.json by:
  1. Removing records with duplicate OSM IDs (keep most-enriched copy).
  2. Removing records with the same normalised name + postcode (keep most-enriched copy).
  3. Merging very-close pairs (<= NEAR_THRESHOLD_KM) from different sources by keeping
     the Atlas entry and enriching it with any missing fields from the OSM-only sibling.
"""
from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Any

DATA_PATH = Path("data/minigolf_atlas_germany.json")
REPORT_PATH = Path("data/deduplication_report.json")
SUMMARY_PATH = Path("data/minigolf_atlas_summary.json")

# Pairs closer than this are treated as the same venue
NEAR_THRESHOLD_KM = 0.05  # 50 m

# Fields copied from an OSM-only sibling into an existing Atlas entry when missing
OSM_ENRICH_FIELDS: list[str] = [
    "osm_id", "osm_type", "osm_class",
    "venue_opening_hours",
    "venue_website", "venue_phone",
    "venue_wikipedia", "venue_wikidata",
    "postcode", "place", "resolved_place",
    "street_name", "house_number", "house_number_addon",
    "district", "state", "county",
]


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
    return "".join(c for c in value.lower() if c.isalnum())


def enrichment_score(record: dict[str, Any]) -> int:
    """Higher = more data filled in."""
    fields = [
        "latitude", "longitude", "venue_name", "venue_website", "venue_phone",
        "venue_opening_hours", "osm_id", "venue_google_place_id", "venue_photo_url",
        "postcode", "place", "street_name", "state", "detail_url",
    ]
    return sum(1 for f in fields if record.get(f))


def enrich_record(target: dict[str, Any], source: dict[str, Any]) -> int:
    updated = 0
    for field in OSM_ENRICH_FIELDS:
        val = source.get(field)
        if val and not target.get(field):
            target[field] = val
            updated += 1
    return updated


# ---------------------------------------------------------------------------
# Step 1: Deduplicate by OSM-ID
# ---------------------------------------------------------------------------
def dedup_by_osm_id(records: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    seen: dict[tuple[str, str], int] = {}   # (type, id) -> index in kept list
    kept: list[dict[str, Any]] = []
    removed: list[dict[str, Any]] = []

    for record in records:
        osm_type = str(record.get("osm_type") or "").strip()
        osm_id   = str(record.get("osm_id")   or "").strip()
        key = (osm_type, osm_id)

        if not osm_type or not osm_id:
            kept.append(record)
            continue

        if key not in seen:
            seen[key] = len(kept)
            kept.append(record)
        else:
            existing = kept[seen[key]]
            if enrichment_score(record) > enrichment_score(existing):
                # New copy is richer – enrich existing from it and keep best coords
                enrich_record(existing, record)
                if record.get("latitude") and not existing.get("latitude"):
                    existing["latitude"] = record["latitude"]
                    existing["longitude"] = record["longitude"]
            removed.append(record)

    return kept, removed


# ---------------------------------------------------------------------------
# Step 2: Deduplicate by normalised name + postcode
# ---------------------------------------------------------------------------
def dedup_by_name_postcode(records: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    seen: dict[tuple[str, str], int] = {}   # (postcode, norm_name) -> index in kept
    kept: list[dict[str, Any]] = []
    removed: list[dict[str, Any]] = []

    for record in records:
        pc   = str(record.get("postcode") or "").strip()
        name = normalize_name(record.get("venue_name"))

        if not pc or len(name) <= 4:
            kept.append(record)
            continue

        key = (pc, name)
        if key not in seen:
            seen[key] = len(kept)
            kept.append(record)
        else:
            existing = kept[seen[key]]
            # Enrich whichever is richer and remove the weaker copy
            if enrichment_score(record) > enrichment_score(existing):
                enrich_record(existing, record)
            removed.append(record)

    return kept, removed


# ---------------------------------------------------------------------------
# Step 3: Merge very-close pairs (< NEAR_THRESHOLD_KM, different sources)
# ---------------------------------------------------------------------------
def merge_near_pairs(records: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int, list[dict[str, Any]]]:
    with_coords  = [(i, r) for i, r in enumerate(records) if r.get("latitude") and r.get("longitude")]
    to_remove: set[int] = set()
    merge_log: list[dict[str, Any]] = []

    for a in range(len(with_coords)):
        ia, ra = with_coords[a]
        if ia in to_remove:
            continue
        for b in range(a + 1, len(with_coords)):
            ib, rb = with_coords[b]
            if ib in to_remove:
                continue
            dist = haversine_km(ra["latitude"], ra["longitude"], rb["latitude"], rb["longitude"])
            if dist > NEAR_THRESHOLD_KM:
                continue
            src_a = str(ra.get("source_plz_group") or "")
            src_b = str(rb.get("source_plz_group") or "")
            if src_a == src_b and src_a != "osm":
                continue  # same atlas group – let name+postcode dedup handle it

            # Prefer Atlas entry (non-osm); enrich it from the OSM sibling, then drop sibling
            if src_b == "osm":
                primary, secondary, ki = ia, ib, "A←B"
            elif src_a == "osm":
                primary, secondary, ki = ib, ia, "B←A"
            else:
                # Both osm – keep richer
                if enrichment_score(rb) > enrichment_score(ra):
                    primary, secondary, ki = ib, ia, "B←A(both_osm)"
                else:
                    primary, secondary, ki = ia, ib, "A←B(both_osm)"

            fields_updated = enrich_record(records[primary], records[secondary])
            to_remove.add(secondary)
            merge_log.append({
                "kept": records[primary].get("venue_name"),
                "removed": records[secondary].get("venue_name"),
                "distance_m": round(dist * 1000, 1),
                "direction": ki,
                "fields_updated": fields_updated,
            })

    kept = [r for i, r in enumerate(records) if i not in to_remove]
    return kept, len(to_remove), merge_log


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    records: list[dict[str, Any]] = load_json(DATA_PATH, [])
    if not records:
        raise RuntimeError(f"No records in {DATA_PATH}")

    print(f"Input: {len(records)} records")

    records, osm_dup_removed = dedup_by_osm_id(records)
    print(f"After OSM-ID dedup:       {len(records)} records  (removed {len(osm_dup_removed)})")

    records, name_pc_removed = dedup_by_name_postcode(records)
    print(f"After name+postcode dedup:{len(records)} records  (removed {len(name_pc_removed)})")

    records, near_removed, merge_log = merge_near_pairs(records)
    print(f"After near-pair merge:    {len(records)} records  (merged {near_removed})")

    save_json(DATA_PATH, records)

    summary = load_json(SUMMARY_PATH, {})
    summary["deduplication_last_run_unix"] = int(time.time())
    summary["total_records"] = len(records)
    save_json(SUMMARY_PATH, summary)

    report = {
        "generated_at_unix": int(time.time()),
        "records_before": len(records) + len(osm_dup_removed) + len(name_pc_removed) + near_removed,
        "records_after": len(records),
        "osm_id_duplicates_removed": len(osm_dup_removed),
        "name_postcode_duplicates_removed": len(name_pc_removed),
        "near_pair_merges": near_removed,
        "near_pair_merge_log": merge_log,
        "osm_id_dup_examples": [
            {"venue_name": r.get("venue_name"), "postcode": r.get("postcode")}
            for r in osm_dup_removed[:20]
        ],
        "name_pc_dup_examples": [
            {"venue_name": r.get("venue_name"), "postcode": r.get("postcode")}
            for r in name_pc_removed[:20]
        ],
    }
    save_json(REPORT_PATH, report)

    print(f"\nDone. Removed {len(osm_dup_removed) + len(name_pc_removed) + near_removed} duplicates total.")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
