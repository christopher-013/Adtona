import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import vm from "node:vm";

const sandbox = {
  console,
  globalThis: {},
  localStorage: { getItem: () => "", setItem: () => {} },
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  fetch: async () => { throw new Error("network disabled in smoke test"); }
};
sandbox.globalThis = sandbox;
vm.runInNewContext(readFileSync("dynamic-catalog.js", "utf8"), sandbox, { filename: "dynamic-catalog.js" });

const seoul = {
  name: "Seoul",
  admin1: "Seoul",
  country: "South Korea",
  latitude: 37.5665,
  longitude: 126.978
};

assert.equal(
  sandbox.wikipediaCategoryPageMatchesDestination({
    title: "White Spot (restaurant)",
    extract: "White Spot is a Canadian restaurant chain based in Vancouver, British Columbia.",
    coordinates: [{ lat: 49.2827, lon: -123.1207 }]
  }, seoul),
  false,
  "A Vancouver restaurant must not enter a Seoul catalog"
);

assert.equal(
  sandbox.wikipediaCategoryPageMatchesDestination({
    title: "Ueno restaurant",
    extract: "A Japanese restaurant in Tokyo, Japan."
  }, seoul),
  false,
  "An unlocated article that identifies another country must not enter a Seoul catalog"
);

assert.equal(
  sandbox.wikipediaCategoryPageMatchesDestination({
    title: "Gwangjang Market",
    extract: "A traditional street market in Jongno District, Seoul, South Korea.",
    coordinates: [{ lat: 37.5701, lon: 126.9996 }]
  }, seoul),
  true,
  "A Seoul place with nearby coordinates must remain eligible"
);

assert.ok(
  sandbox.geographicDistanceKm(37.5665, 126.978, 49.2827, -123.1207) > 8000,
  "The locality gate must recognize Vancouver as far outside Seoul"
);

const categoryFetch = async (url) => {
  const text = decodeURIComponent(String(url)).replace(/\+/g, " ");
  if (text.includes("incategory:")) {
    const category = text.match(/incategory:"([^"]+)"/)?.[1] || "";
    const search = category === "Restaurants in Seoul"
      ? [
          { pageid: 1, title: "White Spot (restaurant)" },
          { pageid: 2, title: "Ueno restaurant" },
          { pageid: 3, title: "Gwangjang Market" }
        ]
      : [];
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ query: { search } }) };
  }
  if (text.includes("pageids=")) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ query: { pages: {
        1: { pageid: 1, title: "White Spot (restaurant)", extract: "A Canadian restaurant chain based in Vancouver.", coordinates: [{ lat: 49.2827, lon: -123.1207 }] },
        2: { pageid: 2, title: "Ueno restaurant", extract: "A Japanese restaurant in Tokyo, Japan." },
        3: { pageid: 3, title: "Gwangjang Market", extract: "A traditional market and dining destination in Seoul, South Korea.", coordinates: [{ lat: 37.5701, lon: 126.9996 }] }
      } } })
    };
  }
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) };
};
const categorySandbox = {
  console,
  globalThis: {},
  localStorage: { getItem: () => "", setItem: () => {} },
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  fetch: categoryFetch
};
categorySandbox.globalThis = categorySandbox;
vm.runInNewContext(readFileSync("dynamic-catalog.js", "utf8"), categorySandbox, { filename: "dynamic-catalog.js" });
const categoryPlaces = await categorySandbox.fetchWikipediaCategoryPlaces("Seoul", seoul);
const categoryNames = categoryPlaces.map((place) => place.name);
assert.ok(categoryNames.includes("Gwangjang Market"), "A verified Seoul result must survive the category pipeline");
assert.ok(!categoryNames.includes("White Spot (restaurant)"), "White Spot must be removed by the category ingestion pipeline");
assert.ok(!categoryNames.includes("Ueno restaurant"), "A Tokyo article without Seoul affinity must be removed by the category ingestion pipeline");

const appSource = readFileSync("app.js", "utf8");
assert.match(appSource, /destinationKey:\s*normalizeDestinationName\(destination\)/);
assert.match(appSource, /suggestionLookup\.get\(suggestion\.key\)/);
assert.match(appSource, /filter\(belongsToCurrentDestination\)/);

console.log("Destination isolation smoke test passed.");
