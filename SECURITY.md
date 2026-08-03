# Security policy

## Public version

This repository is intentionally a static, client-only demo. It does not call OpenAI or another metered API. Its Content Security Policy allows local application assets, Google Fonts, HTTPS images and local photo `data:`/`blob:` sources, Open-Meteo forecast and geocoding requests, Wikivoyage/Wikipedia public-source lookup requests, OpenStreetMap Overpass lookups, and Google Maps embeds. Scripts remain limited to same-origin files and embedded objects are blocked.

## Browser storage and external requests

- Trip answers, generated drafts, user-added bookings, food, and shopping entries are stored in `localStorage` under compatibility keys that begin with `plantoguide-`.
- Resized photo image data is stored in the local `plantoguide` IndexedDB database when IndexedDB is available. Photo metadata may also be stored with the draft.
- `ADTONA-TRIP-PLAN.md` contains photo metadata only. `ADTONA-TRIP-DATA.json` and the complete ZIP export can contain locally stored photo data so the user can preserve a full-fidelity archive.
- Clearing site data removes browser-local drafts and photos. Export first if the trip should be retained.
- Destination and weather features may contact Open-Meteo, Wikimedia Commons, Wikipedia, Wikivoyage, and OpenStreetMap/Overpass. Google Maps links or frames contact Google when opened or loaded.
- The optional feedback form submits its fields to the same-origin Cloudflare Worker, which validates and filters the content before creating an issue through GitHub. Cloudflare and GitHub receive the connection and feedback data needed to process that request.

These disclosures are why the application says the saved draft stays in the browser rather than claiming that nothing ever leaves the device.

## Secret handling

- Never commit API keys, access tokens, passwords, private certificates, or populated `.env` files.
- Never place an API key in `index.html`, `app.js`, URL parameters, browser storage, or client-side configuration.
- Never ask public visitors to paste an OpenAI API key into this website.
- If a key is accidentally committed, revoke it immediately, remove it from Git history, and create a new key.
- Store keys only as encrypted environment variables in a private server-side deployment.

## ChatGPT App

The Apps SDK edition does not call the OpenAI API and does not require an OpenAI API key. ChatGPT creates the structured itinerary and calls the app's MCP rendering tool. The app server must still be hosted securely over HTTPS.

The prototype is stateless and has no user accounts. Add OAuth, authorization checks, encrypted storage, deletion controls, and a privacy policy before saving trips, bookings, or other user-specific data.

## Other AI-enabled deployments

Any AI-enabled edition must be deployed separately from the public demo. It should require authentication, validate all request fields, impose per-user rate limits, set spending limits, avoid logging secrets, and return only validated structured data to the browser.

Public access to an endpoint funded by the owner's API key can create owner charges. No code can guarantee otherwise while that endpoint remains publicly callable.

## Reporting

Do not open a public issue containing a suspected credential. Revoke the credential first, then contact the repository owner privately.
