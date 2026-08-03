# Adtona — Version 5 UI working copy

## v5.4.0 Public-release branding and content polish

- Establishes the public message hierarchy: “Free AI travel planner,” “Plan the trip. Build the guide. Go.,” and “Adto na. Go now.”
- Expands the crawlable Learn More, privacy, and FAQ content while keeping the compact builder experience.
- Updates search, Open Graph, Twitter, structured-data, manifest, favicon, Apple-touch, maskable, and social-preview metadata and assets.
- Rebrands generated guides, printable output, ChatGPT App copy, documentation, and new export filenames to Adtona.
- Preserves `plantoguide-trip`, `xtravel-trip`, `plantoguide-*` storage keys, MCP resource identifiers, and legacy export filename aliases for backwards compatibility.
- Migrates the service-worker cache to `adtona-5.4.0` while cleaning obsolete Adtona and PlanToGuide application caches.

## v5.3.63 Compact footer and Learn More lightbox

- Replaces the long information article below Trip Basics with a compact Pictayo-style footer.
- Adds Send feedback, Privacy, and Learn More actions to the bottom of the builder and generated guide.
- Moves Adtona's product overview, workflow, FAQ, and research notice into an accessible Learn More lightbox.
- Keeps the detailed content in the document for search visibility without extending the welcome screen.

## v5.3.53 Meal-window scheduling and fuller days

- Anchors breakfast to the selected Travel Style start time, lunch at 12:30 PM, and dinner within the selected 6–8 PM evening window.
- Protects generated meals from being pushed later by flexible activities while continuing to preserve confirmed booking times.
- Builds toward nine useful daily events, keeps at least seven when the schedule is tight, and retains eight or nine whenever activity and travel time fit.
- Uses at least 60 minutes for meals, realistic activity durations, travel buffers, and half-hour schedule increments.
- Adds an itinerary timing regression test covering the meal windows and seven-to-nine event policy.

## v5.3.52 Destination-isolated recommendations

- Rejects Wikipedia category results whose coordinates or article summary do not match the requested destination.
- Prevents saved or late-arriving recommendation objects from crossing into a newly selected destination.
- Invalidates older device-local dynamic catalogs that may contain incorrectly associated places.
- Adds a Seoul regression test proving Vancouver's White Spot and a Tokyo restaurant cannot enter the Seoul catalog.

## v5.3.51 Consistent workflow navigation

- Uses one shared set of arrow, marker, label, gap, and padding dimensions for
  the Step 2, Step 3, and Step 4 workflow menus.
- Keeps the four workflow buttons equal in width and prevents the active step
  from changing the menu height.
- Applies the same compact responsive geometry across the workflow on phones.

## v5.3.50 Verified destinations and typo recovery

- Blocks Adventure until a non-catalog destination resolves through the existing live geocoder.
- Keeps invalid entries such as random letters on Trip Basics with a clear correction message.
- Suggests a clickable corrected catalog destination for close, common misspellings.
- Distinguishes “not found” from a temporary destination-verification outage.

## v5.3.49 Enter-to-continue guided questions

- Maps Enter in active Step 3 and Step 4 fields to the same action as the visible Next button.
- Prevents a delayed dropdown change from advancing twice when Enter was also pressed.
- Removes the redundant Skip links because Next already moves forward without requiring an answer.

## v5.3.48 Guided-question readability

- Enlarges the active Step 3 and Step 4 question cards so the one-question flow uses the available desktop canvas.
- Increases question headings, helper copy, fields, quick-pick choices, and Back/Skip/Next controls for easier reading and tapping.
- Preserves responsive, phone-friendly sizing while keeping the guided card contained within the viewport.

## v5.3.47 Enter-key wizard navigation

- Routes Enter from the Trip Basics destination or date fields through the same
  validation and Adventure transition as the visible continue button.
- Prevents implicit form submission from creating a website before the traveler
  reaches the final Constraints question.

## v5.3.46 resilient suggestion photos

- Limits concurrent Wikimedia image lookups to reduce mobile rate limiting, retries
  transient failures with bounded backoff, and gives every lookup a hard timeout.
- Treats empty image results as temporary and retries them after a cool-down.
- If a catalog image fails to load, resolves the exact Wikipedia/Commons place
  image before falling back permanently to the bundled illustration.

## v5.3.45 bounded production catalog builds

- Bounds deploy-time catalog and image research with hard request and workflow
  timeouts so a slow public source cannot hold a production release indefinitely.
- Reuses the current Adtona production catalog when a fresh research run is
  unavailable.

## v5.3.44 consistent live destination catalogs

- Prevents incomplete, imageless public-source results from becoming a
  device-local 30-day catalog, while keeping thin results visible and retryable.
- Makes duplicate merging and recommendation tie-breaking deterministic so the
  same source data produces the same order on desktop and mobile.
- Adds a source-backed Manila baseline led by Rizal Park, preserves exact
  Wikipedia image titles through suggestion rendering, and includes Manila in
  deploy-time precomputed catalogs.

## v5.3.11 viewport-fit Adventure cards

- Keeps the complete Adventure decision flow inside one standard desktop or
  mobile viewport, with a scroll fallback only for unusually short windows.
- Narrows and vertically enlarges recommendation cards so destination photos
  retain more of their original composition.
- Reduces the decision controls while preserving a 44px accessible touch
  target, and compacts the selection and Back/Next rows.

## v5.3.9 venue-aware suggestion images

- Preserves official venue URLs from Wikivoyage and OpenStreetMap listings so
  ambiguous restaurant and shop names have useful image-search context.
- Rejects people, portraits, and unrelated same-name businesses when matching
  eat/shop photos, then falls back to representative cuisine or shopping
  imagery rather than showing a misleading result.
- Adds a regression fixture for Peter at The Peninsula Tokyo and verifies that
  the venue image wins over unrelated people named Peter.

## v5.3.8 aligned recommendation sources

- Aligns Adventure-card source attribution and Google Maps verification links
  on the same baseline.
- Preserves responsive wrapping and truncation for narrow recommendation cards.

## v5.3.7 centered welcome brand

- Moves the opening Adtona logo and value statement lower into the upper half
  of the screen instead of crowding the top edge.
- Enlarges the desktop and mobile logo responsively, with a compact override
  for short laptop-height screens.
- Adds regression coverage for the welcome-brand position and scale.

## v5.3.6 centered header actions

- Gives Feedback, Export, and Edit trip one shared flex alignment so every
  header-action label is centered horizontally and vertically.
- Adds regression coverage for the common header-button layout.

## v5.3.5 navigation footnote order

- Moves the public-beta privacy and feedback note below the trip-app bottom
  navigation.
- Keeps the mobile safe-area inset on the final footnote while avoiding
  duplicate bottom padding inside the navigation dock.

## v5.3.4 creation deliverable arc

- Places the five generated-output cards in a persistent half-circle above the
  creation logo and headline.
- Reveals each card sequentially while keeping previous cards visible, with the
  AI Source-of-Truth card appearing last.
- Adds a compact title-only mobile arc and a static reduced-motion equivalent
  so cards remain readable without overlap.
- Adds regression coverage for the arc positions, persistence, and mobile
  composition.

## v5.3.3 consistent wizard dropdowns

- Normalizes every Travel style and Constraints dropdown to a compact 40px
  control height.
- Prevents equal-height question cards from stretching dropdowns or inserting
  large gaps between labels, helper copy, and fields.
- Adds regression coverage for the shared dropdown sizing and card alignment.

## v5.3.2 recommendation text containment

- Keeps long live-research descriptions inside a bounded text row so source
  credits and verification links can never overlap the recommendation copy.
- Truncates unusually long source labels cleanly and protects the links with
  their own footer row.
- Compacts the Redo, Skip, Include, and Favorite controls while preserving a
  44px minimum mobile touch target.
- Adds smoke-test coverage for the content rows and responsive action sizes.

## v5.3.1 welcome and Adventure composition

- Repositions the Trip Basics destination and date controls immediately above
  the bottom actions, leaving a calmer brand-first opening screen.
- Moves the Adventure auto-pick action beside the recommendation heading and
  consolidates it into one clear “Not sure where to begin? Choose for me”
  button.
- Narrows the desktop recommendation frame so more of each location photograph
  remains visible instead of being cropped into an overly panoramic strip.
- Adds responsive and smoke-test regression coverage for the revised layouts.

## v5.3.0 public-beta quality and safety

- Streamlines Trip Basics by hiding the redundant “Where?” and “When?” headings, moving the Adtona lockup upward, and using Tokyo, Japan as the default for a new unsaved trip while preserving returning travelers’ saved destination.
- Makes recommendation swipes glide directly off-screen, aligns generated-guide day swipes with the date strip (left advances; right goes back), and sequences creation deliverables one at a time with the AI Source-of-Truth file last.
- Improves live destination research and fallback photography for Bohol and other uncatalogued destinations, with clearer filtering of non-visitor Wikipedia results.
- Hardens the public feedback endpoint against active-content injection, links, unsafe controls, and profanity before any GitHub request is made.
- Shortens the live-research reminder to “Verify before travel” and keeps it visually secondary.

## v5.2.2 photo-first Adventure recommendations

- Stacks every suggested location photo above its description on desktop and mobile, using a two-thirds image / one-third detail composition.
- Enlarges the responsive recommendation canvas while retaining the swipe, keyboard, redo, skip, include, and favorite behaviors.
- Compacts the Adventure progress navigation, heading, and explanatory copy so the destination image becomes the visual focus.
- Moves the small **Not sure where to begin?** auto-pick helper beneath the recommendation deck.
- Adds short-phone sizing that protects the image area without hiding the location description or 48px decision controls.

## v5.1.17 simplified welcome layout

- Removes the redundant “Turn your trip plan into a mobile travel guide” headline from the merged Trip Basics screen.
- Replaces the generic mode label with the product-value sentence in the centered eyebrow style.
- Further simplifies the first screen to the compact prompts **Where?** and **When?**, removes the secondary tagline, and anchors both import and continue actions to the bottom edge.
- Gives the Adto na continue label a smaller orange brand treatment without changing its validation or navigation behavior.
- Aligns **Where?** and **When?** in one centered desktop row while retaining the compact stacked layout on phones.
- Normalizes the destination, date, import, and continue controls to a consistent 48px height and mirrors the two bottom pill actions.
- Changes the continue label to the compact mixed-case orange treatment **Adto Na. Go Now**.
- Narrows and compacts the destination and date controls while increasing the breathing room between the brand message, questions, and bottom actions.
- Caps the centered destination field below the width of its question heading for a lighter, less form-heavy composition.
- Keeps the concise Adtona tagline, destination/date validation, AI-plan import, and **Adto na - Go now** workflow unchanged.

## v5.1.12 merged welcome + Trip Basics

- Combines the opening Adtona brand screen and Trip Basics into one full-screen, sunrise-over-water experience instead of auto-dismissing into a second screen.
- Places the destination and travel-date questions directly on the branded welcome screen while preserving autocomplete, validation, saved-draft restore, and the automatic seven-day departure default.
- Replaces the old importer card with a compact **Import your AI plan** action and advances to Adventure only when the traveler chooses **Adto na - Go now**.
- Adds responsive and reduced-motion coverage for the merged first screen and updates the V4 UI regression contract so a timer-driven splash cannot return.

## v5.1.11 direct in-app feedback

- Sends feedback to the same-origin `/api/feedback` Cloudflare Worker, which files the GitHub issue server-side without showing a GitHub dialog or requiring a GitHub account.
- Keeps the GitHub credential in the encrypted `GITHUB_TOKEN` Worker secret and removes every browser-side GitHub fallback.
- Removes the optional email field because feedback issues are public, adds a clear privacy warning, and hardens the endpoint with origin, media-type, body-size, honeypot, sanitization, rate-limiting, and generic-error controls.
- Uses only Adtona's existing `bug` and `enhancement` labels so valid issue creation cannot fail because a requested label is missing.
- Adds an isolated Worker contract test and deploy-configuration checks for the API route and static asset passthrough.

## v5.1.10 move Getting around & Daily budget into Bookings

- Moved the **Getting around** ("Sets route and rest guidance") and **Daily budget** ("Guides meals and optional experiences") questions from **Travel style** (Step 3) into **Bookings & real-world constraints** (Step 4). Pure markup move — both are still read by their IDs, so preferences, saved-draft restore, and itinerary generation are unchanged.

## v5.1.9 Taller recommendation photography

- Gives desktop Adventure recommendations a materially taller photo/card area while preserving the swipe actions and Back/Next navigation.
- Allows only low-height desktop Adventure screens to scroll instead of clipping controls; the compact mobile layout remains unchanged.
- Corrects canonical and social metadata to the production hostname `https://adtona.com/`.
- Bumps the browser asset version so existing service-worker users receive the updated layout.

## v5.1.3 Cloudflare deployment packaging

- Adds a deterministic Cloudflare build that publishes only the browser application from `dist/`, never the repository root or `node_modules`.
- Adds a deployment smoke test for missing references, service-worker assets, symlinks, source-code leaks, and Cloudflare's 25 MiB per-file limit.
- Pins Wrangler, adds reproducible deploy/preview scripts, and points canonical/social metadata at `https://atona.com/`.
- Uses the same allowlisted bundle for GitHub Pages and includes `beta-tools.js` in both the deployment and offline service-worker cache.

## v5.1.2 streamline Travel style: drop the "Evening style" question

- Removed the **Evening style** ("Quiet nights or one more adventure?") select from Step 3 to shorten the survey. The `evening` preference now defaults to **flexible** (its previous default), so dinner and end-of-day timing are unchanged for everyone who didn't touch it. Saved-draft restore ignores the removed field gracefully.

## v5.1.1 fix: Skip/Include/Favorite buttons pushed off-screen

- The earlier "no scrollbar on the recommendation card" change let the card grow to fit its content, which on shorter viewports pushed the **Skip / Include / Favorite / Redo action rail below the fold** — the buttons appeared to vanish.
- Restored the deck layout so the card fills the space *above* the pinned action rail (`grid-template-rows: minmax(0,1fr) auto auto`), and the description now **truncates** (line-clamp) instead of scrolling or growing — so both the scrollbar is gone *and* the buttons stay visible.
- **Added a smoke-test guard** (`v4-ui-smoke-test.mjs`) so a build fails if the deck shell stops keeping the card row flexible or the card body stops clipping — this class of regression can't ship again.

## v5.1.0 sharper suggestions, a photo on every card, faster results

- **Wikivoyage places now arrive with a real photo for free** — the listing's `image=` becomes a Commons `Special:FilePath` thumbnail (no extra API call). Combined with the Wikipedia photos already captured, most "see"/"shop" places show a real image with zero per-card lookups.
- **Precomputed catalogs now bake in eat/shop (and imageless sights) photos** — the deploy-time build resolves a representative Commons photo per place using a global keyword cache (so shared keywords like "sushi"/"shopping mall" are fetched once for the whole build). Top destinations show a real photo instantly, with no runtime image lookup.
- **Faster image resolution for restaurants/shops** — they no longer waste a Wikipedia name-search (they almost never have an article); resolution goes straight to the Commons name match and the representative photo, cutting a request per card and easing rate limits.
- **Progressive deck render** — the deck no longer waits for the slowest source. The "See" deck (Wikipedia, with photos) renders as soon as the fast sources resolve, then OpenStreetMap folds in eat/shop when it lands. The re-render preserves your place in the deck.
- **More aggressive image warming** — the first images of every category are warmed the instant research resolves (and lookahead prefetch went 3 → 5), so opening cards and tab switches show a real photo without a placeholder flash.

## v5.0.0 rebrand to Adtona

- **The app is now Adtona** — from the Filipino *"Adto na"* ("go now"). The name, tagline, logo, app icons, favicon, PWA manifest, page metadata (title/description/social cards), and all in-product copy are rebranded from PlanToGuide to Adtona.
- **Tagline: "Plan your trip. Adto na — go now."** The homepage hero now leads with the Adtona logo lockup, a clean headline ("Turn your trip plan into a mobile travel guide."), and the go-now tagline; the old "PLAN·TO·GUIDE" wordplay is retired.
- **New brand art** generated from the Adtona logo: `adtona-logo.png` (horizontal lockup for headers/hero), `adtona-mark.png` (square sun-and-waves emblem for the small brand marks), and refreshed maskable app icons + favicon (`icons/icon-192.png`, `icons/icon-512.png`, `icons/favicon-32.png`). The lockup wordmark is gradient-recolored — **Adto** in red→orange, **na** in a blue sweep — while the emblem and underline swoosh keep their original colors.
- **The spinning compass is gone.** The opening splash and the post-workflow creation screen now show the Adtona logo (the lockup on the splash, the square emblem on the creation stage) instead of the animated compass.
- **Both full-screen moments use the logo palette.** The start screen is a bright "sunrise over water" wash (sun gold → mountains green → water blue) with dark, legible text; the creation-animation screen gets the same logo-color theme.
- **"Go. Now" in the built site's top nav.** The generated trip site shows *Go. Now* (brand orange-red, after the Adtona wordmark) in the header — and the downloadable export now inlines the Adtona emblem so the exported single-file site renders it.
- **Adtona lockup on every workflow step.** The builder's step form now carries the Adtona emblem + wordmark + *Go. Now* at the top-left (shared across all four steps), so the brand is present throughout planning (the old top bar was hidden in this view).
- **Swipe to change day on the generated site (mobile).** On the built trip view (and the downloadable export), a horizontal swipe changes the day while keeping the current tab — works on Home, Itinerary, Bookings, Maps, Food, Shop, and Photos. The current mapping follows the date strip: **swipe left → next day, swipe right → previous day** (a deliberate horizontal flick only, so vertical scrolling is untouched).
- **Compact research-status card.** On the trip home hero, the "Live research catalog / Real places found" card now sits to the right of the **Export** button at the same height, with smaller text.
- **What deliberately did not change:** the GitHub Pages URL and repo path (`.../PlanToGuide/`) stay so the live deployment and existing links keep working; internal storage keys (`plantoguide-*`), the trip file format token (`plantoguide-trip`, plus legacy `xtravel-trip`), and the `PLANTOGUIDE_VERSION` global are unchanged so saved trips, exports, and round-trip imports remain compatible. Placeholder detection now recognizes both the new "Adtona" and legacy "PlanToGuide" filler labels so cached/precomputed catalogs still work.

## v4.3.0 consistent mobile results + a photo on every card

- **Every suggestion card now shows a relevant image, even on a weak mobile connection.** The deck's photos are looked up live from Wikipedia/Commons, and on mobile those lookups often hit a rate-limit (shared carrier IP) that trips the Wikimedia circuit breaker — cards used to fall back to bare initials. Now, when no live photo is available (not found, or throttled), a card shows a **network-free category illustration** matched to the place type (temple, castle, place of worship, museum, nature, city skyline, plated food, café, shopping bags, market stalls) instead of initials. It stays flagged so the retry sweep can still upgrade it to a real photo once a lookup succeeds.
- **Slow connections get more time before falling back to generic filler.** Research timeouts were raised (fetch 6s→9s, Overpass 10s→13s and its server-side query 9s→12s, whole pipeline 12s→16s) so a phone on a weak signal can finish real OpenStreetMap/Wikivoyage lookups instead of aborting into generic discovery cards. The placeholder-to-photo retry sweep also runs more passes (5→8) to catch photos that arrive after a rate-limit window clears.
- Why mobile looked different from desktop: the deck is assembled **live per session** and cached per device for 30 days, so a warm desktop cache showed richer results and photos while a cold, throttled phone showed fewer real places and missing images. These changes narrow that gap; seeding photo URLs into the precomputed catalog (a larger change) would close it entirely.

## v4.2.9 mobile swipe labels, direct feedback, security smoke test

- **Mobile swipe now shows the decision label before the card leaves.** A left/right swipe briefly holds the red **Skip** / green **Include** label (~300 ms) before gliding off-screen (~440 ms), so on a phone you actually see which way it went. Button and keyboard decisions keep their slightly longer hold (360/500 ms). This softens the fully-instant swipe exit from v4.2.5 — just enough to read the label, still a quick flick.
- **Feedback submits directly and never sends the user to GitHub** when a backend endpoint is configured (`FEEDBACK_ENDPOINT` in `beta-tools.js`, pointing at the Cloudflare Worker). On a network failure the reporter now stays in-app with an inline retry message instead of falling back to opening github.com. The Worker also now rejects Origin-less (non-browser) callers outright. *Until the deployed Worker URL is filled into `FEEDBACK_ENDPOINT`, the form still opens a pre-filled GitHub issue as the unconfigured fallback.*
- **Security audit + CI guardrail.** Reviewed the whole static app: no committed secrets, strong CSP (`object-src 'none'`, `base-uri 'self'`, no `unsafe-inline`/`unsafe-eval` in `script-src`), no dangerous DOM sinks, all `target="_blank"` links carry `rel="noopener"`. Because the site is static and the only server write-surface is the feedback Worker (creates issues only, token scoped to issues), a malicious visitor cannot modify or delete site content. Hardened one gap: research/imported **source URLs are now scheme-validated** (`safeExternalUrl`, http/https only) before becoming a link — this matters on the exported trip page, which ships without a CSP. Added `security-smoke-test.mjs` (224 static checks) to `npm run check` and `npm run smoke` so builds fail if any of these regress.

## v4.2.8 creation animation: cream canvas, cards around the words

- The post-Step-4 creation animation returns to a **cream background** (from the dark navy of v4.2.1).
- The five "what we create" cards now fade in at **distributed spots around the centered logo + brand line** — two above the words and three below — instead of stacking in a single spot. Verified at desktop that the cards sit clear of the words with no overlap; phones stack them two-above / three-below.

## v4.2.7 real suggestions lead the deck (far fewer placeholders)

- **The Adventure deck was padding every category to a fixed 20 with generic filler cards** ("Kyoto neighborhood café", "top-rated local restaurant", ...) even when plenty of real researched places existed. Now real, researched places always lead; generic discovery cards only pad a genuinely thin destination up to a small minimum (6), never to 20. Placeholder detection also covers older precomputed fillers.
- **Surfaces more real places** from the existing keyless sources (OpenStreetMap + Wikivoyage + Wikipedia): the OSM fetch keeps more results (120→60 ranked) and the per-slot dining/shopping caps were raised, so well-covered cities fill the deck with real names.
- Result for Kyoto (fully dynamic): See 20/20 real, Eat 19 real (was 13 real + 7 fillers), Shop 9/9 real — zero placeholders. Thin destinations still get a usable deck, padded only up to the minimum.

## v4.2.6 preloaded + always-present suggestion images

- **Preloads the next few cards' images.** When a recommendation card is shown, the next 3 unreviewed cards (see/eat/shop) have their images resolved and their pixels preloaded in the background, so advancing the deck shows the photo immediately instead of a placeholder-then-image flash.
- **Every suggestion gets a representative photo.** Image lookup now tries the exact place on Wikipedia (name + destination), then Wikimedia Commons, then Wikipedia by name only (attractions) — and when no exact-place photo exists (as for most restaurants and shops), it falls back to a photo that represents the *kind* of place: a sushi plate, seafood platter, café, food market, shopping mall, boutique, museum, cathedral, park, and so on. These representative photos are looked up once per keyword and shared across all matching cards, so they add almost no extra requests. The initials placeholder is now a rare last resort.
- Applies to the Adventure deck and the generated itinerary (both use the same image pipeline).

## v4.2.5 seamless swipe exit on the adventure deck

- Swiping a recommendation card left/right now continues immediately in that direction and fades away, with no brief pause first. The label-hold (added so button/keyboard taps show the Skip/Include/Favorite text) now applies only to button and keyboard decisions; a finger swipe flows straight off-screen for a seamless flick.
- The card also travels a bit further off-screen (±140%) and the fly-off is driven by a timer rather than requestAnimationFrame, so it can't stall if the tab is backgrounded.

## v4.2.4 fewer generic "places to shop" placeholders

- Applies the same dining optimization to shopping: the itinerary now prefers real (non-placeholder) shops before any generic "market and independent shops"-style filler, and recognizes older precomputed shopping fillers (PlanToGuide-labeled, no source) as placeholders so they're replaced by real shops when available.
- Finds more real shopping: Wikipedia places are now classified as shopping when their title includes bazaar, arcade, outlet, emporium, department store, flea/night market, or souk (previously only mall/market/shopping), so more real shopping areas reach the catalog. Dynamic shopping fillers are flagged as placeholders.
- Verified: a mixed real+filler catalog now schedules the real shops first (Divisoria Market, SM Mall of Asia, Greenhills) and only then marked placeholders; curated cities still show real shops.

## v4.2.3 fewer generic "places to eat" placeholders

- **Root cause fix (research):** the dining splitter sent every restaurant without a "café" or "market" keyword straight to dinner, so a destination's general restaurants all piled into dinner and lunch/breakfast were left with generic filler. General restaurants (which work for either meal) are now spread across lunch and dinner, so each meal gets real places. Applies to new research and the deploy-time precomputed catalogs.
- **Itinerary fix (pooling):** each day now pools all real (non-placeholder) dining across breakfast/lunch/dinner, so a slot whose own list is exhausted borrows a real restaurant (e.g. a real dinner spot for lunch) before falling back to a "local lunch favorite"-style placeholder. Also recognizes older precomputed fillers (PlanToGuide-labeled, no source) as placeholders so they're replaced by real places when available.
- Verified: a dinner-heavy Manila-style catalog now fills breakfast/lunch/dinner with real places instead of placeholders; curated cities (London) still show all-real meals with zero placeholders.

## v4.2.2 remove free-text "what to see, eat, shop" field

- Removes the optional "What do you want to see, eat, and shop for?" free-text field from Travel style — the Adventure swipe deck and the quick-pick chips already capture these preferences. Reading and restoring the old value is guarded, so existing saved/imported drafts still load.

## v4.2.1 splash-style creation animation + curated stay areas

- **Post-Step-4 creation transition now matches the opening splash:** the same dark navy canvas, animated logo, and "Turning your trip PLAN TO a mobile travel GUIDE" brand line. The old orbiting output cards are replaced by the five "what we create" cards fading in one after another in the same spot, and the whole sequence now runs for the same time as the splash logo screen (~3.6s).
- **Curated "best areas to stay"** for 30 top destinations (Paris, London, Tokyo, New York, Rome, Barcelona, Amsterdam, Honolulu, and more): the Home base quick-pick chips now offer real visitor-friendly neighborhoods (e.g. Paris → Le Marais, Saint-Germain-des-Prés, Latin Quarter, Montmartre…). Destinations without a curated list fall back to catalog-derived areas, then generic options.

## v4.2.0 clearer wizard, smoother swipes, fewer typed answers

- **Wizard buttons name their destination:** Trip basics → "Places to See", then the Adventure Next button reads "Places to Eat", "Places to Shop", and "Travel style" as you advance.
- **Home weather card fixed:** on wide screens the home hero collapses to its min-height, so the golden-report-sized weather card overflowed the banner. The compact banner sizing now applies to the Home card too (as it already did for the Itinerary), so it always sits inside the banner.
- **Swipe deck feel:** the SKIP / INCLUDE / FAVORITE label now holds on-screen (~360ms) before the card glides off in the swipe direction from wherever it was dragged — no more snap-back/reappear, and the decision is readable. **Double-tap a card on touch to Favorite.**
- **Fewer typed answers — quick-pick chips:** Travel style (Home base, Group size, Traveler ages, Trip purpose) and Constraints (Food restrictions, Mobility, Must-do, Things to avoid) now offer tappable common answers; free typing still works. Home-base chips are location-aware (popular areas to stay, from where the destination's top sights cluster). "None"/"No limits" clear the rest; list fields toggle.
- **Removed "Already booked items"** from the wizard — bookings can be added later from the Bookings tab. Existing saved/imported bookings are still honored.

## v4.1.4 fix Step 2 progress sub-labels clipping

- On the Adventure (Step 2) progress bar, the two-line step labels (e.g. "Adventure / See, eat & shop") were overflowing below each chevron and getting clipped, because a fixed chevron height was shorter than the step number + label needed.
- The Step 2 chevrons now size to their content (auto height) with a smaller step circle and balanced padding, so every step's title and sub-label are fully visible and aligned like the other steps. Desktop only; the compact mobile bar (which hides the sub-label by design) is unchanged.

## v4.1.3 direct feedback submission (no GitHub round-trip)

- The feedback form's button is now **Submit**, and feedback is filed to GitHub Issues directly — the reporter never sees GitHub or needs an account/sign-in.
- Adds `feedback-worker.js`, a Cloudflare Worker that holds a GitHub write token as a secret and creates the issue on the user's behalf (a public static site can't hold that token safely). The browser POSTs the feedback JSON to the Worker; setup is documented in `FEEDBACK-WORKER-SETUP.md`.
- `beta-tools.js` gains a `FEEDBACK_ENDPOINT` config: when set to the Worker URL, Submit POSTs there and shows a "Thank you" inline; when empty or the Worker is unreachable, it falls back to opening a pre-filled GitHub issue so no note is lost. CSP now allows `https://*.workers.dev`.

## v4.1.2 mobile adventure card stacks photo over description

- On phones (≤760px) the Adventure recommendation card now stacks the location photo above the description instead of beside it.
- The description no longer scrolls on mobile (`overflow: hidden`), so a horizontal swipe that begins on the description text triggers Skip/Include/Favorite instead of being captured as a vertical scroll. The photo, title, badge, meta, and source links stay visible.
- Desktop/tablet keep the side-by-side photo/description layout.

## v4.1.1 activate Cloudflare Web Analytics

- Sets the Cloudflare Web Analytics beacon token in `beta-tools.js`, turning on aggregate visitor / page-view counting for the public beta. Verified the beacon injects with no CSP violation.

## v4.1.0 beta instrumentation and adventure-card polish

- Adds `beta-tools.js`: a privacy-first, dependency-free public-beta toolkit.
  - **Cloudflare Web Analytics** beacon for aggregate visitor counts (off until a token is pasted into `beta-tools.js`; no third-party request is made while empty). CSP updated to allow `static.cloudflareinsights.com` and `cloudflareinsights.com`.
  - **In-app feedback form** (💬 Send feedback) that composes a pre-filled GitHub issue with type, summary, details, optional contact, page, viewport, version, and user agent — filed to `christopher-013/PlanToGuide` under `feedback,beta` labels. Every "send feedback" link and the trip header Feedback button now open this form.
  - **Local usage log + hidden metrics report** (open with `#beta-metrics` or Ctrl/Cmd+Shift+M): a this-browser-only funnel (sessions → adventure → swipe decisions → constraints → trip generated → export → feedback), with Copy JSON / Reset and a link to the Cloudflare dashboard. Cross-visitor totals live in Cloudflare; interaction detail is per-browser by design (no server, no tracking of individuals).
- Adds the public-beta footnote ("No account needed. Your draft stays in this browser. · Public beta — send feedback ↗") to the generated trip app, above the bottom nav on every tab.
- Moves the Adventure card's Favorite / Already-included badge to its own line directly under the place title.
- Removes the "Needs verification" status pill from generated itinerary activity cards (the trip-wide verify disclaimers and per-place source links already cover it); the status value is preserved in the data for the AI-export research prompts.
- Fixes the Step 2 (Adventure) progress chevron sitting 2px above the row — the current step now aligns with the others.
- Rebuilds `export-styles.js` from the updated `styles.css`.

## v4.0.2 splash-first workflow restarts

- Shows the PlanToGuide title page on every page load, including when a generated or imported trip is saved locally.
- Fades into Trip Basics with saved answers, selections, and favorites restored instead of reopening the finished report automatically.
- Replays the same title transition for Edit Trip and New Trip; New Trip retains its existing clear-and-reset behavior.

## v4.0.1 itinerary choice badges

- Shows `✓ Selected` beside ordinary traveler-chosen itinerary stops and `★ Favorite` beside starred choices.
- Preserves selection keys, categories, favorite state, and activity provenance through the v3 Markdown/JSON schema without breaking legacy v2 imports.
- Keeps selected and favorite stops from being replaced by automatic duplicate-resolution filler.

## v4.0.0 splash and swipeable adventure deck

- Forks the latest synchronized v3.7.6 build onto the `codex/v4-ui-changes` branch without changing the v3 trip-data schema.
- Presents the PlanToGuide hero as a full-screen opening splash, then fades directly into Trip Basics; reduced-motion users get a shorter, static transition.
- Replaces the Adventure grids with one large photo-led recommendation at a time.
- Adds a Tinder-style four-action rail for redo, Skip, Include, and Favorite, plus horizontal pointer/touch swipes, keyboard decisions, review progress, and an end-of-category summary.
- Shows transparent red Skip and green Include overlays before each card exits; Favorite selections receive a star treatment and are scheduled before ordinary selections whenever geographic and time constraints allow.
- Keeps the existing `selectedSuggestions` map as the inclusion source of truth and adds persisted rejection state, so left-swiped places cannot be reintroduced by automatic itinerary backfill.
- Allows an all-skip path: the itinerary generator fills open time from other unreviewed, popularity-ranked recommendations instead of blocking the workflow.

## v3.7.6 synced-build safeguards

- Removes the duplicate `researchModeNotice` element introduced while relocating the live-research card into the Home hero.
- Adds a deterministic export-styles build step and smoke test so the embedded `file://` fallback cannot drift behind `styles.css`.
- Raises the compact Itinerary weather metrics from 6–8px to a more readable 8–10px while keeping the card inside the day banner.
- Adds markup checks for duplicate IDs and cache-version drift across every local asset reference.

## v3.7.5 itinerary banner weather fit

- Fixes the day-by-day Itinerary weather card spilling below the banner on desktop: the golden-reference report type sizing was enlarging the compact banner card, so at desktop widths it wrapped tall and overflowed the shorter day hero (up to ~80px past the banner at ~1000–1100px).
- Restores the intended compact banner sizing with higher-specificity rules that outrank the report styling, so the Itinerary weather card now sits fully inside the day hero at every desktop width.
- Scoped to the Itinerary banner only: the Home banner keeps its larger card, since its hero is taller (export button and research card) and the bigger card fills it cleanly. Desktop only (≥901px); the phone layout (bottom-pinned card) is unchanged.

## v3.7.4 home tab layout and readability

- Shrinks the home banner weather card (tighter padding, spacing, and metric rows) so it fits fully inside the banner instead of spilling below it on desktop.
- Moves the "Live research catalog / Real places found" status card out of the weather column and into the hero, directly beneath the Export complete trip button, where it reads as part of the primary trip summary.
- Enlarges the Home tab at-a-glance content on desktop (day-plan stop names and times, checklist, route legs, section labels, and headings) for more comfortable reading; phone sizes are unchanged.
- Reserves extra hero space on phones only when the research card is shown, so it no longer overlaps the bottom-pinned weather card; catalog destinations keep the compact banner.

## v3.7.3 reliable suggestion images

- Fixes curated Places to See showing mostly placeholder images even after their real photos were fetched: cards rendered during a Wikimedia rate-limit window now retry and pick up the cached or freshly fetched image once the window clears (retry sweeps wait out the actual Retry-After window).
- Searches for images by the leading landmark in combined curated titles ("Westminster Abbey, Big Ben, and the London Eye" → "Westminster Abbey"), which finds a relevant photo and reduces the Wikimedia Commons fallback traffic that was tripping the rate limit.
- Result on London: Places to See image coverage rose from ~5/20 to 20/20.

## v3.7.2 curated destination priority

- Makes curated catalogs the explicit editorial source of truth whenever curated, precomputed, cached, and live-researched catalogs all match the same destination.
- Expands London's Places to See list to 20 recognizable attractions and districts, ordered around official Visit London must-see guidance instead of padding the list with generic neighborhood placeholders.
- Keeps suggestion Google Maps links scoped to the destination currently being edited instead of appending the previous trip's destination.

## v3.7.1 notability-ranked Places to See

- Queries Wikipedia categories through incoming-links-ranked search instead of alphabetical member listing, so huge categories ("Tourist attractions in London") surface Tower of London and Trafalgar Square instead of obscure A–B articles, and records that rank as a scoring boost.
- Adds average daily Wikipedia pageviews (fetched inside the existing page-details request, no extra API calls) as a secondary notability signal.
- Adds classic sight keywords (castle, palace, cathedral, tower, bridge, abbey, gallery, square) to the ranking vocabulary.
- Filters more non-attraction noise: tube stations, administrative authorities and tourism boards, suburban "Borough of …" categories, and broad city-container articles ("Central London").
- Deduplicates researched places against curated combination entries ("Tower Bridge" no longer duplicates "Tower of London and Tower Bridge").
- Carries the popularity and rank signals into cached and precomputed catalogs.

## v3.7.0 curated catalog enrichment

- Extends thin curated destinations (London, Paris, Tokyo, and the other hand-written catalogs, which carry only ~9 dining and 3 shopping entries) with real researched places from the same public-source pipeline used for uncataloged cities, replacing the generic "top-rated local restaurant"-style filler in Places to Eat and Places to Shop.
- Curated entries stay first and authoritative; enrichment items are deduplicated against them, keep their Wikivoyage/Wikipedia/OpenStreetMap source credits, and generic research filler is never merged in.
- Builds curated cities in the deploy-time catalog job too, so the live site enriches instantly from precomputed data; the browser falls back to a quiet background research pass (no loading takeover, curated board renders immediately) when no precomputed enrichment exists.
- Enrichment flows into the whole trip: suggestion board, itinerary meal/shopping backfill, and the Food and Shop tabs.

## v3.6.6 itinerary-derived day-navigation icons

- Derives each date-navigation emoji from that day's own itinerary (temples, castles, museums, markets, beaches, casinos, theme parks, and more), with the arrival day marked by a departure-flight icon.
- Guarantees every day's icon is unique across the trip: when a day has no recognizable theme, or its theme is already used by an earlier day, it receives a distinct decorative fallback style.
- Persists the derived icon on each day so the generated website, exports, and AI planning files stay consistent.

## v3.6.5 compact constraints

- Reduces every Bookings & real-world constraints entry field to one visible row.
- Keeps constraint and booking fields vertically resizable for longer details.

## v3.6.3 workflow action alignment

- Aligns the AI-updated plan importer with the Trip Basics Next Step action.
- Standardizes Back and forward workflow controls as large rectangular buttons on desktop and mobile.

## v3.6.1 golden-reference readability

- Restyles Emergency Contacts with the Tokyo reference's blush panel, brick-red accents, and stronger contrast.
- Increases emergency, itinerary, booking, route, weather, map, photo, and bottom-navigation typography across desktop and mobile.
- Stacks long emergency contact labels and values on narrow screens so larger text remains readable without horizontal overflow.
- Rebuilds the embedded export stylesheet so downloaded travel guides keep the updated presentation.

## v3.6.0 beta-readiness fixes

- Allows `commons.wikimedia.org` in the CSP so the Wikimedia Commons image fallback added in v3.4.13 actually runs instead of being silently blocked.
- Adds a quality gate to the deploy-time catalog builder: thin catalogs (e.g. a rate-limited run that captured only one Wikivoyage section with placeholder food/shopping) are rejected so runtime research stays available, instead of shipping a degraded catalog that blocks it.
- Merges each deploy with the previous deploy's good catalogs: failed or unreached cities keep their last-known-good data, fresh (< 14 days) catalogs are carried without network work, and coverage converges across deploys. Doubles the research time budget so the full city list is reachable.
- Fixes tourism keyword scoring to whole-word matching so "park" no longer matches "ballpark" and sports venues stop outranking landmarks.
- Makes practical-info merging verification-aware: verified curated or AI-supplied values win, the built-in country table beats "Needs verification" placeholders, and generic defaults are the last resort.
- Runs the Wikimedia Commons image fallback inside the shared lookup queue so image traffic respects the concurrency cap.
- Adds Open Graph / Twitter link-preview tags, a canonical URL, robots.txt, and public-beta feedback links (builder footer and trip header) pointing at GitHub Issues.

## v3.5.9 prioritized Adventure backfill

- Uses traveler-selected places first as the day's primary sights, meals, and shopping stops.
- Backfills missing categories from the destination catalog's popularity-ranked recommendations according to trip length.
- Tracks recommendation names across the full itinerary so automatically added places stay unique from day to day.
- Balances selections across repeated neighborhood days instead of placing every matching choice on the first day.
- Classifies selected restaurants into suitable breakfast, lunch, or dinner slots and keeps ambiguous extras as flexible food stops.
- Evaluates selected shopping and secondary-sight stops before automatic flexible recommendations when the day's time budget is tight.
- Removes an automatic flexible stop before a traveler-selected stop during final time-budget trimming.

## v3.5.7 compact booked-items field

- Places Already booked items inside the same responsive Constraints grid as the other questions.
- Reduces the booking textarea from seven rows to three while preserving the multi-line booking format and examples.

## v3.5.6 compact Travel Style interests field

- Places the optional see, eat, and shop request inside the same responsive question grid as the other Travel Style controls.
- Reduces its textarea to a compact two-line field while preserving resize support and the full planning prompt.

## v3.5.5 recurring Trip Basics brand animation

- Replays the animated PlanToGuide compass and coordinated PLAN TO GUIDE wordmark once per minute while Trip Basics remains open.
- Resets the one-minute countdown when the user returns to Trip Basics and stops it on other workflow steps or in the generated guide.
- Preserves the reduced-motion preference by disabling automatic animation replays when reduced motion is requested.

## v3.5.4 aligned Trip Basics actions

- Places the AI-updated-plan importer and Next Step action on the same bottom row.
- Keeps the importer left-aligned and the primary navigation action right-aligned.
- Uses a compact two-column treatment on mobile without overflowing the questionnaire.

## v3.5.3 coordinated homepage wordmark

- Restyles the product name beneath the animated compass as PLAN TO GUIDE.
- Matches the hero headline's yellow, pale-yellow, and blue typography with the same animated gradient underline beneath GUIDE.
- Preserves a compact, readable treatment on mobile and reduced-motion accessibility.

## v3.5.1 Tokyo-style daily Maps list

- Keeps the existing embedded Google route map and full-route action.
- Replaces verbose Maps cards with a selected-day-only list of numbered locations and addresses.
- Shows the estimated walk, transit, or ride-share/taxi leg to the next stop using distance and traveler transport preferences.
- Removes the redundant View day itinerary buttons from the Maps tab.

## v3.5.0 realistic daily scheduling

- Reserves at least one hour for every full meal, with longer lunch and dinner blocks where appropriate.
- Uses coordinates, travel preference, and neighborhood proximity to produce conservative travel-time estimates between stops.
- Removes lower-priority activities when the complete schedule cannot fit between the traveler's selected start and evening times.
- Aligns generated activity start and end times to easy-to-follow 30-minute increments while preserving exact confirmed reservation start times.
- Carries activity duration and travel-leg details into the website and AI-ready exports.

## v3.4.13 stable Adventure spacing and image fallback

- Prevents the Adventure heading, helper text, and controls from collapsing into one another at all desktop heights.
- Makes the recommendation list the only flexible scrolling row while preserving fixed workflow controls.
- Replaces failed remote recommendation images with a local graphic fallback without exposing long broken-image alternative text.

## v3.4.12 simplified Trip Basics import action

- Removes the Tokyo Family Trip example card from the questionnaire.
- Keeps the AI-updated-plan importer as a single left-aligned support card, with full-width mobile behavior.

## v3.4.11 primary Trip Basics brand banner

- Replaces the airplane and sun decorations with a large animated PlanToGuide compass-X logo beside the opening message.
- Keeps the product name paired with the logo on the left while the builder label, headline, and description remain together on the right.
- Adds a compact two-column mobile treatment and respects reduced-motion preferences.

## v3.4.10 Maps itinerary action layout

- Keeps each Maps-tab “View itinerary” action inside the stop card’s main content column instead of the narrow icon column.
- Preserves a compact pill treatment while allowing long localized dates to wrap cleanly on small screens.

## v3.4.9 split Trip Basics actions

- Anchors the Tokyo example card to the left side of the Trip Basics page and the AI-updated-plan importer to the right.
- Preserves the compact stacked-card treatment on narrow mobile screens.

## v3.4.8 shallow-screen Adventure layout

- Prevents the Adventure title, helper toolbar, and recommendation graphics from overlapping in wide, shallow desktop windows or at increased browser zoom.
- Keeps the recommendation list as the flexible scrolling region while reserving readable rows for workflow controls.

## v3.4.7 full-card Trip Basics actions

- Aligns the Tokyo example and AI-updated-plan cards as a compact group on the right side of the Trip Basics form.
- Makes the complete Tokyo card an external link and the complete AI-plan card an importer button, with keyboard-visible hover and focus feedback.
- Keeps both cards full-width and stacked on narrow screens.

## v3.4.6 quieter live-research status

- Replaces the highlighted yellow Live Research Catalog card with a subtle transparent glass status beneath the weather widget.
- Removes its drop shadow and reduces border contrast while keeping the text legible over destination photography.

## v3.4.5 simplified Trip Basics support area

- Removes the Included with every adventure / Five ready-to-use outputs preview card from Trip Basics.
- Keeps only the Tokyo example and AI-updated-plan import cards immediately before the final, right-aligned Next Step button.

## v3.4.4 Trip Basics supporting-card placement

- Moves the Tokyo example, AI-plan import, and five included-output cards out of the hero banner and into a compact supporting section at the end of Trip Basics.
- Keeps Next Step as the final control, aligned at the bottom right after every supporting card.
- Restyles the moved content for the light form surface and preserves horizontally scrollable deliverable cards on narrow screens.

## v3.4.3 reference-scale workflow and practical travel guidance

- Uses the Tokyo showcase as the desktop scale reference: larger workflow headings, controls, suggestion photography, card copy, and meaningful icons while retaining the contained mobile layout.
- Shortens the trip-building transition and offers repeat visitors a Skip animation control.
- Rejects unrelated Wikimedia image matches, checks several relevant Wikipedia results, and falls back to Wikimedia Commons before retaining an honest branded placeholder.
- Places the compact Live Research Catalog status directly beneath the destination weather card.
- Expands country-aware emergency contacts and adds transit, tipping, and key-phrase guidance for supported non-English-speaking destinations.

## v3.4.2 Home report polish and safety contacts

- Removes the redundant Day by day list from the bottom of the Home tab.
- Improves report typography, itinerary symbols, cards, and navigation readability on desktop-sized displays without changing the mobile scale.
- Reduces the unsupported-destination Live Research Catalog notice to a concise, right-aligned card.
- Keeps Police / Fire / Ambulance, Tourist Hotline (EN), and U.S. Embassy rows visible for every trip, with country-aware contacts for built-in destinations and explicit verification-safe fallbacks elsewhere.

## v3.4.1 gold-standard Home tab

- Rebuilds the generated trip site's Home tab to match the Tokyo gold-standard layout: Selected Day plan card (with locked-booking count and status-colored stops), a time-aware Next Stop widget, Next Reservation (with address and confirmation line when available), Today's Route & Transit timeline, an auto-generated Pre-Trip Checklist, and Emergency Contacts.
- Removes the old placeholder home cards (Today's plan / Next reservation / Transit note / Luggage note / Rainy-day backup / Emergency card), reusing their emoji vocabulary in the new sections.
- Auto-generates the Pre-Trip Checklist from the trip's bookings, practical info, and preferences (no schema change); check state persists per trip and stays interactive in exported guides via a small runtime handler.

## v3.4.0 research reliability release

- Precomputes research catalogs for ~60 top tourist cities at deploy time (`build-precomputed-catalogs.mjs` in the Pages workflow), shipped as `precomputed-catalogs.json`, so most destinations resolve instantly without touching the rate-limited runtime research path.
- Sends the documented `Api-User-Agent` header on every Wikimedia request so the app leaves the strictest anonymous rate-limit bucket.
- Cuts the research request budget roughly in half: category discovery collapsed from eight searches to two, static category names trimmed and deduplicated against discovered ones, and the merged list capped at eight.
- Adds a Wikimedia circuit breaker: the first 429 stops all further Wikimedia requests (including image lookups) until the Retry-After window passes, instead of retrying into the penalty.
- Fails loudly when research is rate limited: Step 2 explains "Live research is busy — showing starter suggestions" with a Retry button, instead of silently rendering placeholders; rate-limited image lookups are skipped without caching the miss.

## v3.3.7 Adventure step viewport sizing

- Expands the desktop Places to see panel to use available vertical space.
- Gives mobile the same contained, no-page-scroll layout while keeping the suggestion list internally scrollable.

## v3.3.6 Trip Basics card order

- Restores the AI-updated-plan import panel beside the Tokyo example on wider screens.
- Places the five deliverable previews beneath both cards across the banner width.
- Uses the same example → import → deliverables order on smaller screens.

## v3.3.5 Trip Basics showcase alignment

- Keeps the Tokyo example above the output preview.
- Places the AI-updated-plan import panel inline at the bottom right of the deliverable cards on wider screens.
- Preserves a clear example → deliverables → import sequence on smaller screens.

## v3.3.4 deliverable explanations

- Moves the static deliverables preview beneath the example and AI import panels.
- Adds detailed mouse-hover and keyboard-focus explanations for every deliverable.
- Expands focused cards on touch-sized screens so the same details remain available without a mouse.

## v3.3.3 Trip Basics output preview

- Adds five static deliverable cards beneath the PLAN TO GUIDE hero message.
- Places the output preview beside the Tokyo example and AI-plan import options on desktop.
- Uses a compact horizontally scrollable card strip on mobile.

## v3.3.2 larger dissolving deliverables

- Enlarges the five creation-transition deliverable cards and their typography across desktop, tablet, and mobile layouts.
- Makes each card expand to a prominent display size, then visibly shrink while blurring and dissolving away.
- Retunes orbit spacing so the larger cards remain within responsive viewport boundaries.
- Uses destination-neutral Mobile Trip App copy and reserves the final reveal for the AI Source-of-Truth File.

## v3.3.1 orbital creation transition

- Surrounds the animated compass and PLAN TO GUIDE message with five floating deliverable cards.
- Gives each card a readable hold before it blurs and dissolves outward, with layouts tuned for desktop, mobile, and short screens.
- Extends the full creation sequence to about 9.6 seconds while retaining a shorter, static reduced-motion experience.

## v3.3.0 four-step creation flow

- Makes Bookings &amp; constraints the final questionnaire step and removes the redundant Output step.
- Builds the complete guide directly from Step 4 with the new Create Your Own Adventure action.
- Moves every output deliverable into the branded creation transition as staggered animated cards.

## v3.2.3 real-device mobile workflow fit

- Removes repeated Step 2 chrome on small screens while retaining the progress path and readable controls.
- Lets only recommendation cards scroll so selection controls and Back/Next stay in the viewport on iPhone-sized screens.
- Prevents Safari text auto-sizing and correctly keeps hidden catalog notices out of the layout.

## v3.2.2 compact adventure workflow

- Keeps the Adventure suggestion step within one desktop or mobile viewport whenever screen height allows.
- Limits visible recommendation rows while preserving every suggestion in an independently scrollable, keyboard-focusable region.
- Keeps the workflow, selection count, and Back/Next controls visible outside the scrolling results.

## v3.2.1 P0/P1 reliability release

- Rejects unusable dynamic catalogs and adds throttled, retryable public-source research.
- Prevents ambiguous city matches and preserves Unicode destination identity.
- Builds non-overlapping day schedules with explicit activity durations and route travel time.
- Preserves imported AI plans, complete guide context, coordinates, photos, and source provenance across reloads and exports.
- Waits for IndexedDB photo transactions to commit and falls back without silently losing data.
- Makes recommendation, file-upload, wizard, tab, and day controls keyboard and screen-reader friendly.
- Adds accurate third-party network disclosure plus exported source/license attributions.

This root folder is now the active V3 workspace for `PlanToGuide`, started from the completed V2 snapshot on 2026-07-10.

## Version snapshots

- `versions/v1` preserves the original Version 1 app.
- `versions/v2` preserves the completed Version 2 app before new V3 changes.
- `versions/v3` is a clean starter copy of this V3 baseline.

## V3 starting point

V3 begins from the polished PlanToGuide V2 app, including:

- Four-step trip intake workflow, with every output introduced during the creation transition.
- Browser-only starter generation for supported and unsupported destinations.
- Shareable mobile travel guide output.
- AI-ready planning/export workflow.
- Photo uploads, bookings, food, shop, maps, itinerary, and AI Export tabs.
- Plan × Guide / PlanToGuide branding and animated compass logo.

Use this workspace for new V3 experiments and larger product changes.

## Phase 1 started

- Added builder PWA metadata (`manifest.webmanifest`), service worker (`sw.js`), and install icons (`icons/`).
- Added exported-guide PWA files to Website ZIP generation.
- Updated the GitHub Pages workflow and standalone docs to ship the new static files.

## Phase 2 verified

- Added IndexedDB-backed photo payload storage through `photo-store.js`.
- Kept photo metadata in `localStorage` while moving resized image data out of the 5MB storage path.
- Verified 25+ photo upload, refresh rendering, ZIP export photo data, deletion cleanup, IndexedDB fallback, and legacy localStorage photo migration.

## Phase 3 implemented

- Hardened import parsing with truncation detection for incomplete `plantoguide-trip` / `xtravel-trip` JSON blocks.
- Added import-dialog pre-check messaging and capped validation error lists.
- Sanitized imported/exported icons and hardened remaining icon render paths that use `innerHTML`.

## Phase 4 implemented

- Replaced blocking `alert`/`prompt` dialogs with a non-blocking toast notification system (`showToast`).
- Added a manual-copy toast fallback with a selectable, read-only textarea when `navigator.clipboard` access is blocked.

## Phase 5 release procedure

1. Update the version string in `version.js`.
2. Update the shared `?v=` value in `index.html` to the same version.
3. Confirm the service worker creates `plantoguide-<version>` and removes older PlanToGuide caches.

## Phase 6 implemented

- Added a neutral destination availability badge on Step 1.
- Catalog destinations show detailed local data availability; unsupported destinations show starter research mode.
- Starter destinations now show a Step 2 note explaining that suggestions are limited and preserved for AI research.

## Phase 7 implemented

- Moved the full destination catalog and known-destination list into `catalogs.json`.
- Kept a Tokyo/Japan embedded fallback for `file://` and catalog fetch failures.
- Added `catalogs.json` to hosted/offline deployment files.

## Phase 9 implemented

- Added `dynamic-catalog.js` for unsupported destination research using only keyless Open-Meteo, Wikivoyage, and Wikipedia endpoints.
- Added a three-tier recommendation flow: curated catalog, live research catalog, then starter fallback.
- Cached dynamic catalogs in browser `localStorage` with a 30-day TTL and size guard.
- Added source credit rendering for public-source suggestions while keeping imported text escaped and inert.

## v3.2.0 fixes

- Allowed OpenStreetMap Overpass requests in the CSP so food/shopping OSM results are no longer silently blocked.
- Made destination research non-blocking: Next advances immediately, research continues in the background, and the suggestion board updates in place when it resolves.
- Fixed dynamic-catalog city matching to key off destination/geocode name only (never country or admin1), so nearby cities in the same country no longer inherit the wrong catalog; bumped the `localStorage` cache namespace to `ptg:dyncat2:`.
- Scoped service worker cache deletion so the builder, exported guides, and other apps on the same origin never delete each other's caches.
- Excluded the large planning files (`TRIP-PLAN.md`, `TRIP-DATA.json`, `AGENT-INSTRUCTIONS.md`, `README.md`) from the exported guide's service worker precache list.
- Fixed re-encoded mojibake (`â€"`) across tracked docs and added `.gitattributes` line-ending rules.
- Simplified `version.js` to a single `globalThis.PLANTOGUIDE_VERSION` assignment and bumped the release to 3.2.0.
- Filtered non-attraction Wikipedia geosearch results (stations beyond the nearest one, schools, faculties, and administrative-boundary articles) out of dynamic catalogs.
- Removed fabricated per-seed stock photos and the unreachable New York seed catalog; seeded cards now rely on the existing Wikipedia image lookup.
- Parallelized the Wikipedia category fetches in dynamic catalog research.
