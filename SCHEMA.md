# Adtona trip schema (`plantoguide-trip`, version 3)

Every exported `TRIP-PLAN.md` ends with a **Machine-Readable Trip Data** section containing:

    ```json plantoguide-trip

Adtona can import the complete Markdown file, a fenced schema block, or the bare JSON object and re-render the trip website.

The `plantoguide-trip` name is intentionally retained as the current machine-readable schema identifier so existing exports, browser drafts, and AI round trips continue to work. `xtravel-trip` remains a legacy import alias. A future schema version may introduce an `adtona-trip` alias only with a migration path.

## Top-level fields

| Field | Type | Notes |
|---|---|---|
| `schema` | string | `"plantoguide-trip"`. The legacy `"xtravel-trip"` alias remains importable. |
| `version` | number | Currently `3`; versions 2 and 3 are accepted. |
| `destination` | string | Required. |
| `start`, `end` | string | `YYYY-MM-DD`. Required. |
| `wishes` | string | Free-text traveler interests. |
| `selections` | array | Traveler-selected places. Optional `key`, `category`, and `favorite` fields preserve Adventure choices. |
| `preferences` | object | Pace, party, home base, budget, restrictions, and related settings. |
| `bookings` | array | `{ name, date, time, status }`. |
| `practical` | object | Emergency, embassy, medical, transit, tipping, phrase, and note fields. |
| `userEntries` | object | Optional v3 object containing `booking`, `food`, and `shop` arrays. |
| `photos` | array | Optional v3 photo metadata; Markdown exports never contain image data URLs. |
| `days` | array | Required, with at least one day. |

## Version 3 user content

Each `userEntries` item uses `{ id, title, date, details }`. Photo metadata uses `{ id, date, caption, capturedAt, latitude?, longitude?, source }`. `TRIP-PLAN.md` contains metadata only so it stays lightweight. `TRIP-DATA.json` may contain complete photo objects, including local `src` data URLs, for a full-fidelity archive.

On import, entries and photo metadata are merged by `id`. Existing browser photo records keep their local image data when the imported planning file contains metadata only.

## Days and activities

Each day uses `{ date, title, zone, activities }`. A zone is `{ name, icon }` or `null`. Each activity uses `{ time, title, type, icon, status, description }`; `time` and `title` are required and activities are sorted by time on import. Optional `userSelected` and `favorite` booleans preserve the traveler-choice pills shown beside itinerary place names. `favorite: true` implies that the activity was selected.

## Compatibility and import tolerance

Version 2 exports using `schema: "xtravel-trip"` and the old `json xtravel-trip` fence remain supported. Version 2 files may omit `userEntries` and `photos`. The importer repairs trailing commas, smart quotes, and stray control characters, then reports per-field validation errors for invalid data.

AI assistants should preserve confirmed bookings, traveler must-dos, and the optional `userSelected` / `favorite` provenance fields; keep prose and JSON synchronized, return the complete updated file, and label unverified live facts rather than inventing them.
