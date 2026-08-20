# City Data Source Audit — 2026-08-20

## Working Cities

| City | Endpoint | Latest Permit | Status | Field Mapping |
|------|----------|---------------|--------|---------------|
| Austin, TX | `data.austintexas.gov/resource/3syk-w9eu` | 2026-07-08 | 🟢 Working | `permit_location`, `issue_date`, `permit_number`, `latitude`, `longitude` |
| Collin County, TX | `data.texas.gov/resource/82ee-gbj5` | 2026-12-29 | 🟢 Working | `situsconcatshort`, `permitissueddate`, `permitnum` |
| Chicago, IL | `data.cityofchicago.org/resource/ydr8-5enu` | 2026-07-07 | 🟢 Working | `street_name`, `issue_date`, `permit_`, `latitude`, `longitude` |
| New York City, NY | `data.cityofnewyork.us/resource/rbx6-tga4` | 2026-07-07 | 🟢 Working | `street_name`, `approved_date`, `tracking_number`, `latitude`, `longitude` |
| Seattle, WA | `data.seattle.gov/resource/ht3q-kdvx` | 2026-07-07 | 🟢 Working | `originaladdress1`, `issueddate`, `permitnum`, `latitude`, `longitude` |
| Orlando, FL | `data.cityoforlando.net/resource/ryhf-m453` | 2026 | 🟢 Working | `permit_address`, `issue_permit_date`, `permit_number` |

## Stale Active Feed

| City | Endpoint | Latest Permit | Reason |
|------|----------|---------------|--------|
| Dallas, TX | `www.dallasopendata.com/resource/e7gq-4sah` | 2019-12-31 | 🟠 Dataset not maintained. City stopped publishing to this endpoint. |

## Broken Cities

| City | Endpoint | HTTP Status | Reason |
|------|----------|-------------|--------|
| Fort Worth, TX | `data.fortworthtexas.gov/resource/gqxy-4nix` | 302 | 🔴 Redirects to ArcGIS Hub. Migrated away from Socrata. |
| Los Angeles, CA | `data.lacity.org/resource/yv23-pmwf` | 403 | 🔴 Requires authentication. App token needed. |
| San Francisco, CA | `data.sfgov.org/resource/hj9w-htr2` | 404 | 🔴 Resource ID invalid or dataset removed. |
| San Diego, CA | `data.sandiego.gov/resource/6c0x-sbhe` | 404 | 🔴 Resource ID invalid or dataset removed. |
| King County, WA | `data.kingcounty.gov/resource/ep2k-f9n7` | 404 | 🔴 Resource ID invalid or dataset removed. |
| Boston, MA | `data.boston.gov/resource/b7a7-szrw` | 404 | 🔴 Resource ID invalid. Boston uses CKAN, not Socrata. |
| Miami-Dade, FL | `opendata.miamidade.gov/resource/mb6e-5m3u` | 302 | 🔴 Redirects to ArcGIS Hub. |
| Detroit, MI | `data.detroitmi.gov/resource/a4rs-s2ux` | 302 | 🔴 Redirects to ArcGIS Hub. |

## Archived Jurisdictions

These feeds are inactive and are not polled. Historical filings, quarantined
records, and alert-deduplication records are intentionally preserved in the
database for audit and reporting. They can be restored if a replacement source
is verified.

| Jurisdiction | Archive reason |
|--------------|----------------|
| Boston, MA | The old Socrata resource is invalid; Boston uses CKAN. |
| Detroit, MI | The old endpoint redirects to ArcGIS Hub. |
| Fort Worth, TX | The old endpoint migrated to ArcGIS Hub. |
| King County, WA | The old resource was removed. |
| Los Angeles, CA | The old resource requires authentication. |
| Miami-Dade, FL | The old endpoint redirects to ArcGIS Hub. |
| San Diego, CA | The old resource was removed or invalid. |
| San Francisco, CA | The old resource was removed or invalid. |

## Field Mapping Notes

- **NYC**: Uses `approved_date` NOT `issued_date`. Address is `house_no` + `street_name` (separate fields).
- **Chicago**: Address is `street_number` + `street_name` (separate fields). Only `street_name` is mapped.
- **Seattle**: Uses `issueddate` (no underscore). Some records have null dates.
- **Collin County**: Future dates exist (2026-12-29) — data quality issue in source.
- **Orlando**: No lat/lng in dataset. Requires geocoding.
- **Austin**: Best dataset — has all fields including coordinates.

## Recommended Actions

1. Keep the seven active feeds under poll diagnostics and verify source freshness after each forced poll.
2. Treat Dallas as stale until a maintained replacement dataset is verified.
3. Consider ArcGIS/CKAN adapters before restoring any archived jurisdiction.
4. Monitor Collin County future dates and cap the ingestion watermark at the current time.
