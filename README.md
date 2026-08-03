# Adtona

**Plan the trip. Build the guide. Go.**

Adtona is a free browser-based AI travel planner and itinerary builder. It turns a destination, preferences, bookings, and practical constraints into a shareable trip website, printable itinerary, and reusable AI planning file.

## Core workflow

1. **Generate:** Complete the four-step wizard. The browser builds a day-by-day trip website with bookings and constraints preserved.
2. **Export:** Download the website ZIP or `ADTONA-TRIP-PLAN.md`. The planning file includes versioned, machine-readable trip data.
3. **Enrich:** Give the planning file to your preferred AI assistant. It is instructed to preserve confirmed items and return the complete updated file.
4. **Import:** Choose **Import updated plan** in Adtona. Paste or upload the returned file to re-render the website.
5. **Publish:** Export again and host the static files on GitHub Pages, Netlify Drop, or another static host.

See [SCHEMA.md](SCHEMA.md) for the `plantoguide-trip` v3 schema and legacy v2 import rules.

## Export contents

- `index.html`, `styles.css`, and `app.js` — complete static trip website
- `manifest.webmanifest`, `sw.js`, and `icons/` — installable/offline support once hosted over HTTPS and opened once
- `adtona-logo.png` and `adtona-mark.png` — Adtona brand assets
- `ADTONA-TRIP-PLAN.md` — human-readable source of truth with embedded trip JSON
- `ADTONA-TRIP-DATA.json` — full machine-readable trip data, including local photo data when available
- `TRIP-PLAN.md` and `TRIP-DATA.json` — compatibility aliases for existing workflows
- `AGENT-INSTRUCTIONS.md` — editing rules for AI agents
- `assets/` — available bundled banners and place images

The hosted Adtona builder also ships `catalogs.json` so detailed destination suggestions can be cached offline; direct `file://` use falls back to the embedded Tokyo/Japan starter catalog.

## Dynamic destination catalogs

Recommendation tiers are intentionally layered:

1. Curated browser catalogs from `catalogs.json`.
2. Keyless live research catalogs for unsupported destinations using Open-Meteo geocoding plus Wikivoyage/Wikipedia public APIs.
3. Starter mode with placeholder cards, research checklists, and AI-ready prompts when live research does not return enough usable signal.

Live research catalog items are planning starters and are labeled for verification. They do not provide current live facts such as hours, closures, prices, ratings, ticket availability, or reservations.

## Photo storage

Uploaded photo metadata stays in `localStorage`; resized image data is stored in IndexedDB through `photo-store.js` so larger journals do not hit the smaller `localStorage` quota. `ADTONA-TRIP-PLAN.md` remains metadata-only for AI handoff, while `ADTONA-TRIP-DATA.json` includes local photo data when available for round-trip export. The legacy filenames remain aliases for existing workflows.

## Featured example

[Tokyo 2026 Family Trip](https://christopher-013.github.io/Tokyo2026/) demonstrates the richer target experience: daily routes, locked bookings, maps, food, shopping, weather, practical information, notes, and photos.

## Run locally

Open `index.html` directly, or run:

```powershell
powershell -ExecutionPolicy Bypass -File .\dev-server.ps1
```

Then visit `http://127.0.0.1:8767`.

The browser edition requires no account or API key. Saved trip answers use `localStorage`; resized photo data uses IndexedDB. Optional destination, weather, map, and feedback features contact the public services described in the in-app Privacy dialog and [SECURITY.md](SECURITY.md).

## Deploy to Cloudflare Workers

The Cloudflare bundle is assembled from an explicit browser-asset allowlist in
`build-cloudflare.mjs`. This prevents `node_modules`, tests, repository history,
and development files from being uploaded as public assets.

```powershell
npm run build:cloudflare
npm run verify:cloudflare
npm run deploy
```

For a Cloudflare Git build, keep the deploy command as `npx wrangler deploy`.
The committed `wrangler.jsonc` runs the static build and publishes only
`./dist`; do not set the static-assets directory to the repository root (`.`).
After the first successful deployment, attach `adtona.com` to the `adtona`
Worker under **Settings → Domains & Routes → Add Custom Domain**.
