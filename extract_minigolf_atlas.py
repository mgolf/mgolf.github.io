from __future__ import annotations

import csv
import json
import argparse
import re
import time
from dataclasses import asdict, dataclass
from html import unescape
from pathlib import Path
from typing import Iterable
from urllib.parse import urlencode
from urllib.request import Request, urlopen


BASE_URL = "https://www.minigolfsport.de"
ATLAS_URL = f"{BASE_URL}/minigolfatlas.php?plz={{digit}}"
OUTPUT_DIR = Path("data")
JSON_PATH = OUTPUT_DIR / "minigolf_atlas_germany.json"
CSV_PATH = OUTPUT_DIR / "minigolf_atlas_germany.csv"
SUMMARY_PATH = OUTPUT_DIR / "minigolf_atlas_summary.json"
GEOCODE_CACHE_PATH = OUTPUT_DIR / "minigolf_atlas_geocode_cache.json"
DETAIL_CACHE_PATH = OUTPUT_DIR / "minigolf_atlas_detail_cache.json"
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36"
GEOCODER_USER_AGENT = "gGolf-minigolf-atlas-enrichment/1.0 (contact: local-workspace)"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
DEFAULT_COUNTRY = "Germany"
DEFAULT_COUNTRY_CODE = "DE"
GEOCODE_DELAY_SECONDS = 1.05


TYPE_COLUMNS = {
    3: "beton",
    4: "eternit",
    5: "filz",
    6: "sonstige",
    7: "unknown",
}

TYPE_LABELS = {
    "beton": "System Beton",
    "eternit": "System Eternit",
    "filz": "System Filz",
    "sonstige": "Sonstige Anlage",
    "unknown": "Unbekannter Anlagentyp",
}

DETAIL_LABELS = {
    "Adresse": "detail_address",
    "Telefon": "detail_phone",
    "Telefax": "detail_fax",
    "Internet": "detail_website",
    "Email": "detail_email",
    "Öffnungszeiten": "detail_opening_hours",
    "Anlagentyp": "detail_facility_type",
    "Weitere Angebote": "detail_additional_offers",
}

ADDRESS_KEYS = (
    "road",
    "pedestrian",
    "footway",
    "street",
    "residential",
    "path",
    "cycleway",
    "service",
)

PLACE_KEYS = (
    "city",
    "town",
    "village",
    "municipality",
    "hamlet",
    "suburb",
    "quarter",
    "neighbourhood",
)


@dataclass
class Record:
    postcode: str
    place: str
    location_raw: str
    address_raw: str
    accepts_minigolf_card: bool
    has_club: bool
    course_types: list[str]
    approved_course_types: list[str]
    detail_url: str | None
    source_plz_group: str
    source_url: str
    place_raw: str = ""
    place_addon: str = ""
    street_name: str = ""
    house_number: str = ""
    house_number_addon: str = ""
    address_extra: str = ""
    address_type: str = "unknown"
    resolved_place: str = ""
    district: str = ""
    state: str = ""
    county: str = ""
    country: str = DEFAULT_COUNTRY
    country_code: str = DEFAULT_COUNTRY_CODE
    latitude: float | None = None
    longitude: float | None = None
    geocode_query: str | None = None
    geocode_display_name: str | None = None
    geocode_source: str | None = None
    venue_name: str | None = None
    venue_category: str | None = None
    venue_website: str | None = None
    venue_phone: str | None = None
    venue_opening_hours: str | None = None
    venue_wikipedia: str | None = None
    venue_wikidata: str | None = None
    osm_id: str | None = None
    osm_type: str | None = None
    osm_class: str | None = None
    detail_address: str | None = None
    detail_phone: str | None = None
    detail_fax: str | None = None
    detail_website: str | None = None
    detail_email: str | None = None
    detail_opening_hours: str | None = None
    detail_facility_type: str | None = None
    detail_additional_offers: str | None = None

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def fetch_html(url: str) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8", errors="replace")


def fetch_json(url: str, headers: dict[str, str]) -> object:
    request = Request(url, headers=headers)
    with urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def clean_html_text(value: str) -> str:
    value = re.sub(r"<br\s*/?>", ", ", value, flags=re.IGNORECASE)
    value = re.sub(r"<[^>]+>", "", value)
    value = unescape(value)
    value = value.replace("\xa0", " ")
    value = re.sub(r"\s+", " ", value)
    return value.strip(" ,")


def extract_href(value: str) -> str | None:
    match = re.search(r'href="([^"]+)"', value, flags=re.IGNORECASE)
    if not match:
        return None
    href = match.group(1).strip()
    if href.startswith("mailto:"):
        return href[7:]
    if href.startswith("http://") or href.startswith("https://"):
        return href
    return f"{BASE_URL}/{href.lstrip('/')}"


def extract_detail_url(cell_html: str) -> str | None:
    match = re.search(r'href="([^"]*minigolfatlas-detail\.php\?url=[^"]+)"', cell_html, flags=re.IGNORECASE)
    if not match:
        return None
    href = match.group(1).strip()
    if href.startswith("http://") or href.startswith("https://"):
        return href
    return f"{BASE_URL}/{href.lstrip('/')}"


def parse_location(location_text: str) -> tuple[str, str]:
    match = re.match(r"^(\d{5})\s+(.*)$", location_text)
    if match:
        postcode = match.group(1)
        place = re.sub(r"\s+", " ", match.group(2)).strip()
        return postcode, place
    return "", location_text


def split_place(place: str) -> tuple[str, str]:
    normalized = re.sub(r"\s+", " ", place).strip(" ,")
    if not normalized:
        return "", ""

    for separator in (" - OT ", " / ", " - "):
        if separator in normalized:
            main_place, addon = normalized.split(separator, 1)
            return main_place.strip(" ,"), addon.strip(" ,")

    return normalized, ""


def normalize_street_text(street: str) -> str:
    street = re.sub(r"(?<=[A-Za-zÄÖÜäöüß\.])(?=\d)", " ", street)
    street = re.sub(r"\s+", " ", street)
    return street.strip(" ,")


def split_house_number(raw_number: str, raw_addon: str) -> tuple[str, str]:
    match = re.match(r"^(\d+)([A-Za-z]?)$", raw_number)
    if not match:
        return raw_number.strip(), raw_addon.strip()
    base_number = match.group(1)
    suffix = match.group(2)
    addon = " ".join(part for part in [suffix, raw_addon.strip()] if part).strip()
    return base_number, addon


def split_street_address(street: str) -> tuple[str, str, str]:
    normalized = normalize_street_text(street)
    if not normalized:
        return "", "", ""

    match = re.match(
        r"^(?P<street_name>.+?)\s+(?P<house_number>\d+[A-Za-z]?)(?:\s*(?P<house_addon>[A-Za-z0-9./-]+(?:\s*[A-Za-z0-9./-]+)*))?$",
        normalized,
    )
    if not match:
        return "", "", ""

    street_name = match.group("street_name").strip(" ,")
    house_number, house_number_addon = split_house_number(
        match.group("house_number"),
        match.group("house_addon") or "",
    )
    return street_name, house_number, house_number_addon


def split_address_components(address: str) -> tuple[str, str, str, str, str]:
    normalized = normalize_street_text(address)
    if not normalized:
        return "", "", "", "", "unknown"

    extras: list[str] = []

    def replace_parenthetical(match: re.Match[str]) -> str:
        value = clean_html_text(match.group(1))
        if value:
            extras.append(value)
        return " "

    normalized = re.sub(r"\(([^)]+)\)", replace_parenthetical, normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip(" ,")

    street_name, house_number, house_number_addon = split_street_address(normalized)
    if street_name and house_number:
        address_extra = ", ".join(part for part in extras if part)
        return street_name, house_number, house_number_addon, address_extra, "street_address"

    street_pattern = re.compile(
        r"(?i)(straße|str\.?|weg|allee|platz|gasse|ring|chaussee|ufer|pfad|promenade|stieg|steig|damm|berg|markt|park|hof|line|chaussee)$"
    )
    if street_name and not house_number:
        address_extra = ", ".join(part for part in extras if part)
        return street_name, "", "", address_extra, "street_without_number"
    if street_pattern.search(normalized):
        address_extra = ", ".join(part for part in extras if part)
        return normalized, "", "", address_extra, "street_without_number"

    extras.insert(0, normalized)
    address_extra = ", ".join(part for part in extras if part)
    return "", "", "", address_extra, "named_place"


def derive_venue_name(hit: dict[str, object], record: Record) -> str | None:
    namedetails = hit.get("namedetails") or {}
    if isinstance(namedetails, dict):
        for key in ("name", "official_name", "short_name"):
            value = namedetails.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

    display_name = hit.get("display_name")
    if not isinstance(display_name, str) or not display_name.strip():
        return None

    candidate = display_name.split(",", 1)[0].strip()
    if not candidate or re.match(r"^\d", candidate):
        return None
    if candidate.lower() == record.street_name.lower():
        return None
    return candidate


def choose_first(mapping: dict[str, object], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = mapping.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def build_geocode_queries(record: Record) -> list[str]:
    queries: list[str] = []

    if record.detail_address:
        queries.append(f"{record.detail_address}, {DEFAULT_COUNTRY}")

    if record.street_name and record.house_number:
        address_part = " ".join(part for part in [record.street_name, record.house_number, record.house_number_addon] if part).strip()
    elif record.street_name:
        address_part = record.street_name
    else:
        address_part = record.address_extra or record.address_raw

    place_part = " ".join(part for part in [record.postcode, record.place_raw or record.place] if part).strip()
    base_query = ", ".join(part for part in [address_part, place_part, DEFAULT_COUNTRY] if part)
    base_query = re.sub(r"\s+", " ", base_query).strip(" ,")
    if base_query:
        queries.append(base_query)

    if record.postcode or record.place:
        fallback = " ".join(part for part in [record.postcode, record.place] if part).strip()
        if fallback:
            queries.append(f"Minigolf, {fallback}, {DEFAULT_COUNTRY}")

    deduped: list[str] = []
    seen: set[str] = set()
    for query in queries:
        if query and query not in seen:
            deduped.append(query)
            seen.add(query)
    return deduped


def load_cache(path: Path) -> dict[str, object]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_cache(path: Path, cache: dict[str, object]) -> None:
    path.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def geocode_search(query: str) -> dict[str, object] | None:
    params = urlencode(
        {
            "q": query,
            "format": "jsonv2",
            "limit": 1,
            "countrycodes": "de",
            "addressdetails": 1,
            "namedetails": 1,
            "extratags": 1,
        }
    )
    url = f"{NOMINATIM_URL}?{params}"
    payload = fetch_json(url, headers={"User-Agent": GEOCODER_USER_AGENT, "Accept": "application/json"})
    if not payload:
        return None

    first = payload[0]
    return {
        "latitude": float(first["lat"]),
        "longitude": float(first["lon"]),
        "display_name": first.get("display_name"),
        "address": first.get("address") or {},
        "namedetails": first.get("namedetails") or {},
        "extratags": first.get("extratags") or {},
        "osm_id": str(first.get("osm_id")) if first.get("osm_id") is not None else None,
        "osm_type": first.get("osm_type"),
        "osm_class": first.get("class"),
        "venue_category": first.get("type"),
        "source": "nominatim",
    }


def parse_detail_page(html: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    row_matches = re.findall(r"<TR VALIGN=\"TOP\">(.*?)</TR>", html, flags=re.IGNORECASE | re.DOTALL)
    for row_html in row_matches:
        label_match = re.search(r"<B>([^<:]+):</B>", row_html, flags=re.IGNORECASE)
        cell_matches = re.findall(r"<TD[^>]*>(.*?)</TD>", row_html, flags=re.IGNORECASE | re.DOTALL)
        if not label_match or len(cell_matches) < 2:
            continue

        label = clean_html_text(label_match.group(1))
        target_field = DETAIL_LABELS.get(label)
        if not target_field:
            continue

        value_html = cell_matches[1]
        href = extract_href(value_html)
        value_text = clean_html_text(value_html)
        fields[target_field] = href or value_text

    return fields


def enrich_with_detail_pages(records: list[Record]) -> None:
    cache = load_cache(DETAIL_CACHE_PATH)
    updated = False

    for record in records:
        if not record.detail_url:
            continue
        if record.detail_url not in cache:
            cache[record.detail_url] = parse_detail_page(fetch_html(record.detail_url))
            updated = True

        detail_fields = cache.get(record.detail_url) or {}
        if not isinstance(detail_fields, dict):
            continue

        for field_name, value in detail_fields.items():
            if isinstance(value, str) and value.strip():
                setattr(record, field_name, value.strip())

        if record.detail_address:
            record.detail_address = re.sub(r"\s+", " ", record.detail_address).strip()

    if updated or not DETAIL_CACHE_PATH.exists():
        save_cache(DETAIL_CACHE_PATH, cache)


def apply_geocode_data(record: Record, query: str, hit: dict[str, object]) -> None:
    address = hit.get("address") if isinstance(hit.get("address"), dict) else {}
    extratags = hit.get("extratags") if isinstance(hit.get("extratags"), dict) else {}

    record.geocode_query = query
    record.geocode_display_name = hit.get("display_name") if isinstance(hit.get("display_name"), str) else None
    record.geocode_source = hit.get("source") if isinstance(hit.get("source"), str) else None
    record.latitude = hit.get("latitude") if isinstance(hit.get("latitude"), float) else None
    record.longitude = hit.get("longitude") if isinstance(hit.get("longitude"), float) else None
    record.osm_id = hit.get("osm_id") if isinstance(hit.get("osm_id"), str) else None
    record.osm_type = hit.get("osm_type") if isinstance(hit.get("osm_type"), str) else None
    record.osm_class = hit.get("osm_class") if isinstance(hit.get("osm_class"), str) else None
    record.venue_category = hit.get("venue_category") if isinstance(hit.get("venue_category"), str) else None
    record.venue_name = derive_venue_name(hit, record)
    record.venue_website = choose_first(extratags, ("website", "contact:website")) or None
    record.venue_phone = choose_first(extratags, ("phone", "contact:phone")) or None
    record.venue_opening_hours = choose_first(extratags, ("opening_hours",)) or None
    record.venue_wikipedia = choose_first(extratags, ("wikipedia",)) or None
    record.venue_wikidata = choose_first(extratags, ("wikidata",)) or None

    resolved_street_name = choose_first(address, ADDRESS_KEYS)
    if resolved_street_name:
        record.street_name = resolved_street_name

    resolved_house_number = choose_first(address, ("house_number",))
    if resolved_house_number:
        record.house_number, record.house_number_addon = split_house_number(resolved_house_number, "")

    record.resolved_place = choose_first(address, PLACE_KEYS)
    record.district = choose_first(address, ("suburb", "quarter", "neighbourhood"))
    record.state = choose_first(address, ("state",))
    record.county = choose_first(address, ("county",))
    record.country = choose_first(address, ("country",)) or record.country
    record.country_code = choose_first(address, ("country_code",)).upper() or record.country_code

    resolved_postcode = choose_first(address, ("postcode",))
    if resolved_postcode and not record.postcode:
        record.postcode = resolved_postcode
    if not record.place and record.resolved_place:
        record.place = record.resolved_place


def enrich_with_geocodes(records: list[Record]) -> None:
    cache = load_cache(GEOCODE_CACHE_PATH)
    new_requests = 0

    for index, record in enumerate(records, start=1):
        for query in build_geocode_queries(record):
            if query not in cache:
                cache[query] = geocode_search(query)
                new_requests += 1
                time.sleep(GEOCODE_DELAY_SECONDS)

            hit = cache.get(query)
            if isinstance(hit, dict):
                apply_geocode_data(record, query, hit)
                break

        if new_requests and new_requests % 25 == 0:
            save_cache(GEOCODE_CACHE_PATH, cache)
            print(f"Geocoded {index}/{len(records)} records; cache entries: {len(cache)}")

    save_cache(GEOCODE_CACHE_PATH, cache)


def initialize_structured_address(record: Record) -> None:
    record.place_raw = record.place
    record.place, record.place_addon = split_place(record.place)
    (
        record.street_name,
        record.house_number,
        record.house_number_addon,
        record.address_extra,
        record.address_type,
    ) = split_address_components(record.address_raw)
    record.country = DEFAULT_COUNTRY
    record.country_code = DEFAULT_COUNTRY_CODE


def parse_row(cells: list[str], source_plz_group: str, source_url: str) -> Record | None:
    if len(cells) != 9:
        return None

    location = clean_html_text(cells[0])
    address = clean_html_text(cells[1])
    if not location and not address:
        return None

    postcode, place = parse_location(location)
    detail_url = extract_detail_url(cells[0]) or extract_detail_url(cells[1])
    accepts_minigolf_card = "icon-minigolfcard" in cells[2]
    has_club = "verein.gif" in cells[8]

    course_types: list[str] = []
    approved_course_types: list[str] = []
    for index, type_code in TYPE_COLUMNS.items():
        if "<img" not in cells[index].lower():
            continue
        course_types.append(type_code)
        if re.search(r"system-[a-z]+1\.gif", cells[index], flags=re.IGNORECASE):
            approved_course_types.append(type_code)

    record = Record(
        postcode=postcode,
        place=place,
        location_raw=location,
        address_raw=address,
        accepts_minigolf_card=accepts_minigolf_card,
        has_club=has_club,
        course_types=course_types,
        approved_course_types=approved_course_types,
        detail_url=detail_url,
        source_plz_group=source_plz_group,
        source_url=source_url,
    )
    initialize_structured_address(record)
    return record


def extract_table_rows(html: str) -> Iterable[list[str]]:
    table_match = re.search(
        r'<table[^>]*class="daten"[^>]*>(.*?)</table>',
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not table_match:
        return []

    table_html = table_match.group(1)
    row_matches = re.findall(r"<tr[^>]*>(.*?)</tr>", table_html, flags=re.IGNORECASE | re.DOTALL)
    rows: list[list[str]] = []
    for row_html in row_matches:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row_html, flags=re.IGNORECASE | re.DOTALL)
        if cells:
            rows.append(cells)
    return rows


def fetch_all_records() -> list[Record]:
    records: list[Record] = []
    for digit in range(10):
        source_url = ATLAS_URL.format(digit=digit)
        html = fetch_html(source_url)
        for cells in extract_table_rows(html):
            record = parse_row(cells, str(digit), source_url)
            if record is not None:
                records.append(record)
    return records


def write_json(records: list[Record]) -> None:
    payload = [record.to_dict() for record in records]
    JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_csv(records: list[Record]) -> None:
    with CSV_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(records[0].to_dict().keys()))
        writer.writeheader()
        for record in records:
            row = record.to_dict()
            row["accepts_minigolf_card"] = str(record.accepts_minigolf_card).lower()
            row["has_club"] = str(record.has_club).lower()
            row["course_types"] = "|".join(record.course_types)
            row["approved_course_types"] = "|".join(record.approved_course_types)
            writer.writerow(row)


def write_summary(records: list[Record]) -> None:
    type_counts = {key: 0 for key in TYPE_LABELS}
    approved_type_counts = {key: 0 for key in TYPE_LABELS}
    plz_group_counts = {str(index): 0 for index in range(10)}
    detail_count = 0
    card_count = 0
    club_count = 0
    geocoded_count = 0
    structured_address_count = 0
    house_number_count = 0
    named_place_count = 0
    venue_name_count = 0
    venue_website_count = 0
    detail_contact_count = 0

    for record in records:
        plz_group_counts[record.source_plz_group] += 1
        detail_count += int(record.detail_url is not None)
        card_count += int(record.accepts_minigolf_card)
        club_count += int(record.has_club)
        geocoded_count += int(record.latitude is not None and record.longitude is not None)
        structured_address_count += int(bool(record.street_name))
        house_number_count += int(bool(record.house_number))
        named_place_count += int(record.address_type == "named_place")
        venue_name_count += int(bool(record.venue_name))
        venue_website_count += int(bool(record.venue_website or record.detail_website))
        detail_contact_count += int(bool(record.detail_phone or record.detail_email or record.detail_website))
        for type_code in record.course_types:
            type_counts[type_code] += 1
        for type_code in record.approved_course_types:
            approved_type_counts[type_code] += 1

    summary = {
        "total_records": len(records),
        "records_with_detail_page": detail_count,
        "records_accepting_minigolf_card": card_count,
        "records_with_club": club_count,
        "records_with_coordinates": geocoded_count,
        "records_with_structured_street": structured_address_count,
        "records_with_house_number": house_number_count,
        "records_with_named_place_address": named_place_count,
        "records_with_venue_name": venue_name_count,
        "records_with_website": venue_website_count,
        "records_with_detail_contact_data": detail_contact_count,
        "plz_group_counts": plz_group_counts,
        "course_type_counts": type_counts,
        "approved_course_type_counts": approved_type_counts,
        "course_type_labels": TYPE_LABELS,
    }
    SUMMARY_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract and normalize Minigolf Atlas facilities.")
    parser.add_argument(
        "--skip-geocode",
        action="store_true",
        help="Skip public geocoding and only write normalized atlas/detail-page data.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    records = fetch_all_records()
    enrich_with_detail_pages(records)
    if not args.skip_geocode:
        enrich_with_geocodes(records)
    write_json(records)
    write_csv(records)
    write_summary(records)
    print(f"Wrote {len(records)} records to {JSON_PATH} and {CSV_PATH}")


if __name__ == "__main__":
    main()