/*
 * build-precomputed-catalogs.mjs — deploy-time destination research
 *
 * Runs the same research pipeline the browser uses (dynamic-catalog.js), but server-side
 * during the GitHub Pages deploy: no browser rate-limit pressure, sequential pacing, and a
 * proper API user agent. The output ships as precomputed-catalogs.json so most real queries
 * never touch the fragile runtime research path.
 *
 * Reliability model:
 *  - A quality gate rejects thin catalogs (e.g. a run where rate limits left only a
 *    Wikivoyage main page's listings and placeholder food/shopping). Rejected cities keep
 *    runtime research available instead of shipping a poisoned catalog that blocks it.
 *  - The previous deploy's file is fetched and merged: cities that fail (or aren't
 *    reached) this run keep their last-known-good catalog, so coverage converges across
 *    deploys instead of resetting on every bad research day.
 *  - Cities with a fresh (< 14 days) good catalog are carried over without any network
 *    work, so the time budget is spent on missing and stale destinations.
 *
 * Usage: node build-precomputed-catalogs.mjs [--out path] [--limit N]
 * Env: PREVIOUS_CATALOGS_URL overrides where the previous deploy's file is fetched from.
 * Requires Node 18+ (global fetch). Always writes the output file and exits 0 so a bad
 * research day degrades the catalog instead of breaking the deploy.
 */

import { writeFile } from "node:fs/promises";

// Importing the browser IIFE as an ESM side-effect module attaches the api to globalThis.
await import("./dynamic-catalog.js");
const { buildDynamicCatalog, destinationMatchPattern, isWikimediaThrottled, wikimediaRetryAfterMs } = globalThis;

const TOTAL_TIME_BUDGET_MS = 40 * 60 * 1000;
const PER_CITY_DELAY_MS = 1500;
const REFRESH_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const PREVIOUS_CATALOGS_URL = process.env.PREVIOUS_CATALOGS_URL
  || "https://christopher-013.github.io/PlanToGuide/precomputed-catalogs.json";

// Top tourist destinations. Curated catalogs.json cities are included on purpose: their
// hand-written catalogs are authoritative but thin on dining and shopping (~9 eat / 3 shop),
// and the client merges these researched catalogs into them as enrichment.
const CITIES = [
  "London", "Paris", "Tokyo", "New York", "Rome", "Lisbon", "Honolulu", "Vancouver", "Seattle",
  "Las Vegas", "Los Angeles", "San Diego", "San Francisco", "Chicago", "Miami", "Orlando",
  "New Orleans", "Boston", "Washington", "Austin", "Nashville", "Denver", "Philadelphia",
  "Barcelona", "Madrid", "Seville", "Amsterdam", "Berlin", "Munich", "Vienna", "Prague",
  "Budapest", "Athens", "Istanbul", "Dublin", "Edinburgh", "Venice", "Florence", "Milan",
  "Naples", "Porto", "Brussels", "Copenhagen", "Stockholm", "Oslo", "Helsinki", "Zurich",
  "Geneva", "Krakow", "Warsaw", "Dubai", "Singapore", "Bangkok", "Phuket", "Hong Kong",
  "Seoul", "Kyoto", "Osaka", "Taipei", "Kuala Lumpur", "Hanoi", "Ho Chi Minh City",
  "Sydney", "Melbourne", "Auckland", "Toronto", "Montreal", "Mexico City", "Cancun",
  "Rio de Janeiro", "Buenos Aires", "Cairo", "Marrakesh", "Cape Town"
];

function parseArgs(argv) {
  const args = { out: "precomputed-catalogs.json", limit: CITIES.length };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--out" && argv[index + 1]) args.out = argv[++index];
    else if (argv[index] === "--limit" && argv[index + 1]) args.limit = Math.max(1, Number(argv[++index]) || CITIES.length);
  }
  return args;
}

function isRealItem(item) {
  const label = String(item?.sourceLabel || "");
  return Boolean(label) && !/^plantoguide/i.test(label) && !item?.placeholder;
}

export function catalogQuality(catalog) {
  const see = (catalog?.attractions || []).filter((item) => !item?.placeholder);
  const food = catalog?.food || {};
  return {
    realSee: see.length,
    wikipediaSee: see.filter((item) => /wikipedia/i.test(item?.sourceLabel || "")).length,
    realEat: ["breakfast", "lunch", "dinner"].flatMap((slot) => food[slot] || []).filter(isRealItem).length,
    realBuy: (catalog?.shopping || []).filter(isRealItem).length
  };
}

// Reject catalogs that would ship a degraded experience AND block runtime research from
// improving it: enough real sights plus real food (and shopping, unless dining coverage is
// strong) rather than generic placeholders. This catches both observed failure modes — a
// rate-limited run that captured only one Wikivoyage section (Las Vegas: sports listings,
// zero real dining), and runs where only Wikipedia succeeded (real sights, placeholder food).
export function isGoodCatalog(catalog) {
  const quality = catalogQuality(catalog);
  return quality.realSee >= 6 && quality.realEat >= 2 && (quality.realBuy >= 1 || quality.realEat >= 6);
}

async function loadPreviousGoodCatalogs() {
  try {
    const response = await fetch(PREVIOUS_CATALOGS_URL, { headers: { "cache-control": "no-cache" } });
    if (!response.ok) return [];
    const data = await response.json();
    const entries = Array.isArray(data?.precomputedCatalogs) ? data.precomputedCatalogs : [];
    const good = entries.filter(isGoodCatalog);
    console.log(`Previous deploy: ${entries.length} catalogs, ${good.length} pass the quality gate.`);
    return good;
  } catch (error) {
    console.warn(`No previous catalogs available (${error?.message || error}).`);
    return [];
  }
}

function previousForCity(previous, city) {
  const lower = city.toLowerCase();
  return previous.find((entry) => String(entry.sourceCity || "").toLowerCase() === lower)
    || previous.find((entry) => String(entry.label || "").toLowerCase().startsWith(lower));
}

function isFresh(entry) {
  const builtAt = Date.parse(entry?.builtAt || "");
  return Number.isFinite(builtAt) && Date.now() - builtAt < REFRESH_AFTER_MS;
}

function augmentedMatchPattern(city, catalog) {
  // The pipeline's own pattern covers the entered name and geocode name; add the common
  // "City, Region" and "City, Country" spellings travelers actually type.
  const geocodeName = catalog.label?.split(",")[0]?.trim() || city;
  const parts = String(catalog.label || "").split(",").map((part) => part.trim()).filter(Boolean);
  const admin1 = parts.length > 2 ? parts[1] : "";
  const country = parts.length > 1 ? parts[parts.length - 1] : "";
  const aliases = [city, geocodeName];
  if (admin1) aliases.push(`${geocodeName} ${admin1}`);
  if (country) aliases.push(`${geocodeName} ${country}`);
  return destinationMatchPattern(aliases);
}

async function main() {
  const { out, limit } = parseArgs(process.argv);
  const previousGood = await loadPreviousGoodCatalogs();
  const started = Date.now();
  const catalogs = [];
  const failures = [];
  const rejected = [];
  let carriedCount = 0;

  const carry = (entry, reason, city) => {
    catalogs.push(entry);
    carriedCount += 1;
    console.log(`carry (${reason}): ${city}`);
  };

  for (const city of CITIES.slice(0, limit)) {
    const previous = previousForCity(previousGood, city);
    if (previous && isFresh(previous)) {
      carry(previous, "fresh", city);
      continue;
    }
    if (Date.now() - started > TOTAL_TIME_BUDGET_MS) {
      if (previous) carry(previous, "budget", city);
      else failures.push(city);
      continue;
    }
    if (typeof isWikimediaThrottled === "function" && isWikimediaThrottled()) {
      const waitMs = wikimediaRetryAfterMs();
      console.warn(`Rate limited; waiting ${Math.ceil(waitMs / 1000)}s before ${city}…`);
      await new Promise((resolve) => setTimeout(resolve, waitMs + 500));
    }
    try {
      const catalog = await buildDynamicCatalog(city);
      if (catalog && isGoodCatalog(catalog)) {
        // Deliberately no longer bakes generic "representative" Commons photos onto items
        // that lack one. Those are keyword searches, not the venue, so they shipped wrong
        // images for precomputed cities (a random dinner-table snapshot standing in for a
        // named Tokyo venue). Items keep only their own source image; the app draws its
        // bundled category illustration when there isn't one.
        catalogs.push({ ...catalog, match: undefined, matchPattern: augmentedMatchPattern(city, catalog), sourceCity: city, builtAt: new Date().toISOString() });
        const quality = catalogQuality(catalog);
        console.log(`ok: ${city} (see ${quality.realSee} / eat ${quality.realEat} / buy ${quality.realBuy})`);
      } else if (catalog) {
        rejected.push(city);
        const quality = catalogQuality(catalog);
        console.warn(`rejected (thin): ${city} — see ${quality.realSee}, wikipedia ${quality.wikipediaSee}, eat ${quality.realEat}, buy ${quality.realBuy}`);
        if (previous) carry(previous, "rejected", city);
      } else {
        failures.push(city);
        console.warn(`no catalog: ${city}`);
        if (previous) carry(previous, "failed", city);
      }
    } catch (error) {
      failures.push(city);
      console.warn(`failed: ${city} — ${error?.message || error}`);
      if (previous) carry(previous, "failed", city);
    }
    await new Promise((resolve) => setTimeout(resolve, PER_CITY_DELAY_MS));
  }

  // Keep any remaining previous good catalogs (e.g. after city-list edits) that this run
  // didn't rebuild or carry, deduped by slug with this run's entries winning.
  const seenSlugs = new Set(catalogs.map((entry) => entry.slug).filter(Boolean));
  previousGood.forEach((entry) => {
    if (entry.slug && !seenSlugs.has(entry.slug)) {
      seenSlugs.add(entry.slug);
      catalogs.push(entry);
      carriedCount += 1;
    }
  });

  const payload = { generatedAt: new Date().toISOString(), count: catalogs.length, precomputedCatalogs: catalogs };
  await writeFile(out, JSON.stringify(payload));
  console.log(`Wrote ${out}: ${catalogs.length} catalogs (${carriedCount} carried forward), ${rejected.length} rejected as thin${rejected.length ? ` (${rejected.join(", ")})` : ""}, ${failures.length} failures${failures.length ? ` (${failures.join(", ")})` : ""}.`);
}

await main();
