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
const api = sandbox;

const normal = readFileSync("test-fixtures/wikivoyage-normal.wiki", "utf8");
const nested = readFileSync("test-fixtures/wikivoyage-nested.wiki", "utf8");

const normalItems = api.parseWikivoyageListings(normal, "Fixture City");
assert.equal(normalItems.length, 4);
assert.equal(normalItems[0].name, "Old Town Square");
assert.equal(normalItems[0].type, "see");
assert.equal(normalItems[2].type, "eat");
assert.equal(normalItems[3].type, "buy");
assert.equal(normalItems[0].sourceLabel, "Wikivoyage");

const nestedItems = api.parseWikivoyageListings(nested, "Nested City");
assert.equal(nestedItems.length, 2);
assert.equal(nestedItems[0].name, "City Museum");
assert.match(nestedItems[0].detail, /historic rooms/);
assert.equal(nestedItems[1].name, "Harbor Café");
assert.match(nestedItems[1].detail, /regional pastries/);

const peterOfficialUrl = "https://www.peninsula.com/en/tokyo/hotel-fine-dining/peter-modern-french";
const peterItems = api.parseWikivoyageListings(
  `{{eat|name=Peter|url=${peterOfficialUrl}|address=24th Floor, The Peninsula Tokyo hotel|lat=35.67471|long=139.76063|content=Modern French dining with Imperial Palace views.}}`,
  "Tokyo/Chiyoda"
);
assert.equal(peterItems.length, 1);
assert.equal(peterItems[0].name, "Peter");
assert.equal(peterItems[0].type, "eat");
assert.equal(peterItems[0].officialUrl, peterOfficialUrl, "The exact venue URL must survive Wikivoyage parsing");
assert.equal(peterItems[0].address, "24th Floor, The Peninsula Tokyo hotel");

const catalog = api.assembleDynamicCatalog("Fixture City", { name: "Fixture City", country: "Exampleland" }, {
  wikivoyageTitle: "Fixture City",
  wikivoyageItems: normalItems,
  wikipediaItems: [
    { name: "Old Town Square", type: "see", area: "Center", detail: "A second public-source record.", image: "https://images.example/square.jpg", lat: 48.14, lon: 11.58, sourceLabel: "Wikipedia", sourceUrl: "https://en.wikipedia.org/wiki/Old_Town_Square", sourceId: "wikipedia:101", sourceLicense: "CC BY-SA 4.0", sourceAttribution: "Wikipedia contributors" },
    { name: "Hill View", type: "see", area: "North", detail: "A scenic viewpoint.", sourceLabel: "Wikipedia", sourceUrl: "https://en.wikipedia.org/wiki/Hill_View", sourceId: "wikipedia:102", sourceLicense: "CC BY-SA 4.0", sourceAttribution: "Wikipedia contributors" },
    { name: "Art Walk", type: "see", area: "Arts", detail: "A public art route.", sourceLabel: "Wikipedia", sourceUrl: "https://en.wikipedia.org/wiki/Art_Walk" },
    { name: "Garden", type: "see", area: "Park", detail: "A central green space.", sourceLabel: "Wikipedia", sourceUrl: "https://en.wikipedia.org/wiki/Garden" }
  ]
});
assert.equal(catalog.dynamic, true);
assert.equal(catalog.researchMode, true);
assert.ok(catalog.match.test("Fixture City"));
assert.ok(catalog.attractions.length >= 4);
assert.ok(catalog.food.breakfast.length >= 3);
assert.ok(catalog.shopping.length >= 1);
const mergedAttraction = catalog.attractions.find((item) => item.name === "Old Town Square");
assert.equal(mergedAttraction.lat, 48.14);
assert.equal(mergedAttraction.lon, 11.58);
assert.equal(mergedAttraction.image, "https://images.example/square.jpg");
assert.ok(mergedAttraction.sources.some((source) => source.id === "wikipedia:101"));
assert.ok(mergedAttraction.sources.some((source) => source.label === "Wikivoyage"));
assert.ok(mergedAttraction.sources.every((source) => Object.hasOwn(source, "license") && Object.hasOwn(source, "attribution")));

const peterCatalog = api.assembleDynamicCatalog("Tokyo, Japan", { name: "Tokyo", country: "Japan" }, {
  wikivoyageTitle: "Tokyo/Chiyoda",
  wikivoyageItems: peterItems,
  wikipediaItems: [
    { name: "Tokyo National Museum", type: "see", area: "Ueno", detail: "A major museum.", sourceLabel: "Wikipedia" },
    { name: "Senso-ji", type: "see", area: "Asakusa", detail: "A major temple.", sourceLabel: "Wikipedia" }
  ]
});
const assembledPeter = Object.values(peterCatalog.food).flat().find((item) => item.name === "Peter");
assert.equal(assembledPeter.officialUrl, peterOfficialUrl, "Venue context must survive catalog assembly");

const thinCatalog = api.assembleDynamicCatalog("Thin City", { name: "Thin City", country: "Exampleland" }, {
  wikipediaItems: [
    { name: "Real Museum", type: "see", area: "Center", detail: "A real museum.", lat: 1, lon: 2, sourceLabel: "Wikipedia", sourceId: "wikipedia:201", sourceLicense: "CC BY-SA 4.0" },
    { name: "Real Park", type: "see", area: "North", detail: "A real park.", lat: 3, lon: 4, sourceLabel: "Wikipedia", sourceId: "wikipedia:202", sourceLicense: "CC BY-SA 4.0" }
  ]
});
assert.equal(thinCatalog.attractions.length, 4, "Two real attractions should be padded to a safe four-card catalog");
assert.equal(thinCatalog.attractions.filter((item) => item.placeholder).length, 2);
assert.equal(thinCatalog.attractions.find((item) => item.name === "Real Museum").sourceId, "wikipedia:201");

assert.equal(api.assembleDynamicCatalog("Empty City", { name: "Empty City" }, {}), null);
assert.equal(api.assembleDynamicCatalog("Food Only City", { name: "Food Only City" }, {
  osmItems: [
    { name: "Cafe One", type: "eat" }, { name: "Cafe Two", type: "eat" }, { name: "Cafe Three", type: "eat" }
  ]
}), null, "Food-only results must not be accepted as an itinerary catalog");
assert.equal(api.assembleDynamicCatalog("Shop Only City", { name: "Shop Only City" }, {
  osmItems: [{ name: "Market One", type: "buy" }, { name: "Market Two", type: "buy" }]
}), null, "Shop-only results must not be accepted as an itinerary catalog");
assert.equal(api.assembleDynamicCatalog("One Sight City", { name: "One Sight City" }, {
  wikipediaItems: [{ name: "Only Landmark", type: "see" }]
}), null, "One attraction is insufficient for itinerary generation");

const unicodeCatalog = api.assembleDynamicCatalog("München, Deutschland", { name: "München", country: "Deutschland" }, {
  wikipediaItems: [
    { name: "Residenz München", type: "see", sourceLabel: "Wikipedia" },
    { name: "Englischer Garten", type: "see", sourceLabel: "Wikipedia" }
  ]
});
assert.ok(unicodeCatalog.match.test("München, Deutschland"));
assert.ok(unicodeCatalog.match.test("München"));
assert.equal(unicodeCatalog.match.test("Münchenberg"), false, "Unicode destination matching must be exact, not ASCII word-boundary based");

const osmEnhancedCatalog = api.assembleDynamicCatalog("OSM Food City", { name: "OSM Food City", country: "Exampleland" }, {
  wikivoyageTitle: "OSM Food City",
  wikivoyageItems: normalItems,
  wikipediaItems: [
    { name: "Riverfront Park", type: "see", area: "Riverfront", detail: "A popular waterfront park.", sourceLabel: "Wikipedia" },
    { name: "Science Museum", type: "see", area: "Museum District", detail: "A major museum.", sourceLabel: "Wikipedia" },
    { name: "Old Fort", type: "see", area: "Historic Core", detail: "A historic attraction.", sourceLabel: "Wikipedia" }
  ],
  osmItems: [
    { name: "Blue Bottle Cafe", type: "eat", area: "Downtown", detail: "OpenStreetMap-listed cafe.", cuisine: "Cafe", sourceLabel: "OpenStreetMap", osmScore: 80 },
    { name: "Central Food Hall", type: "eat", area: "Market District", detail: "OpenStreetMap-listed food hall.", cuisine: "Food hall", sourceLabel: "OpenStreetMap", osmScore: 78 },
    { name: "Harbor Dinner House", type: "eat", area: "Waterfront", detail: "OpenStreetMap-listed restaurant.", cuisine: "Seafood", sourceLabel: "OpenStreetMap", osmScore: 76 },
    { name: "City Market", type: "buy", area: "Market District", detail: "OpenStreetMap-listed marketplace.", bestFor: "Market, food goods, and local browsing", sourceLabel: "OpenStreetMap", osmScore: 82 },
    { name: "Design Arcade", type: "buy", area: "Arts District", detail: "OpenStreetMap-listed boutique cluster.", bestFor: "Boutiques and local fashion", sourceLabel: "OpenStreetMap", osmScore: 79 }
  ]
});
assert.ok(osmEnhancedCatalog.food.breakfast.some((item) => item.name === "Blue Bottle Cafe"));
assert.ok(osmEnhancedCatalog.food.lunch.some((item) => item.name === "Central Food Hall"));
assert.ok(osmEnhancedCatalog.food.dinner.some((item) => item.name === "Harbor Dinner House"));
assert.ok(osmEnhancedCatalog.shopping.some((item) => item.name === "City Market"));
assert.ok(osmEnhancedCatalog.sources.some((source) => source.label === "OpenStreetMap"));

const sanDiegoCatalog = api.assembleDynamicCatalog("San Diego, California", {
  name: "San Diego",
  admin1: "California",
  country: "United States"
}, {
  wikivoyageTitle: "San Diego",
  wikivoyageItems: [],
  wikipediaItems: []
});
assert.equal(sanDiegoCatalog.dynamic, true);
assert.equal(sanDiegoCatalog.researchMode, true);
assert.ok(sanDiegoCatalog.match.test("San Diego"));
const sanDiegoAttractions = sanDiegoCatalog.attractions.map((item) => item.name);
for (const expected of ["San Diego Zoo", "Balboa Park", "SeaWorld San Diego"]) {
  assert.ok(sanDiegoAttractions.includes(expected), `Expected San Diego attraction: ${expected}`);
}
assert.ok(sanDiegoAttractions.some((name) => /beach|cove/i.test(name)), "Expected a San Diego beach/coastal recommendation");
assert.ok(sanDiegoCatalog.shopping.some((item) => /Seaport Village|Liberty Public Market|Fashion Valley/.test(item.name)));
assert.ok(Object.values(sanDiegoCatalog.food).flat().some((item) => /taco|seafood|brunch/i.test(`${item.name} ${item.cuisine}`)));
assert.equal(api.catalogHasSeededAnchors({
  attractions: [{ name: "Generic San Diego landmark" }, { name: "Downtown walk" }]
}, "San Diego, California"), false);
assert.equal(api.catalogHasSeededAnchors(sanDiegoCatalog, "San Diego, California"), true);

const losAngelesCatalog = api.assembleDynamicCatalog("Los Angeles, California", {
  name: "Los Angeles",
  admin1: "California",
  country: "United States"
}, {
  wikivoyageTitle: "Los Angeles",
  wikivoyageItems: [],
  wikipediaItems: []
});
assert.equal(losAngelesCatalog.dynamic, true);
assert.ok(losAngelesCatalog.match.test("Los Angeles"));
const losAngelesAttractions = losAngelesCatalog.attractions.map((item) => item.name);
for (const expected of ["Griffith Observatory", "Santa Monica Pier", "The Getty Center", "Universal Studios Hollywood"]) {
  assert.ok(losAngelesAttractions.includes(expected), `Expected Los Angeles attraction: ${expected}`);
}
assert.ok(losAngelesAttractions.some((name) => /Hollywood Walk of Fame|Venice Beach/i.test(name)), "Expected a major Hollywood or beach recommendation");
assert.ok(losAngelesCatalog.shopping.some((item) => /The Grove|Rodeo Drive|Abbot Kinney/.test(item.name)));
assert.ok(Object.values(losAngelesCatalog.food).flat().some((item) => /Grand Central Market|Original Farmers Market|taco/i.test(`${item.name} ${item.cuisine}`)));
assert.equal(api.catalogHasSeededAnchors({
  attractions: [{ name: "Generic Los Angeles landmark" }, { name: "Downtown walk" }]
}, "Los Angeles, California"), false);
assert.equal(api.catalogHasSeededAnchors(losAngelesCatalog, "Los Angeles, California"), true);

const boholCatalog = api.assembleDynamicCatalog("Bohol", {
  name: "Bohol",
  admin1: "Central Visayas",
  country: "Philippines",
  country_code: "PH"
}, {
  wikivoyageTitle: "Bohol",
  wikivoyageItems: [],
  wikipediaItems: [],
  osmItems: []
});
assert.equal(boholCatalog.dynamic, true);
assert.equal(boholCatalog.label, "Bohol, Philippines");
assert.ok(boholCatalog.match.test("Bohol"));
const boholAttractions = boholCatalog.attractions.map((item) => item.name);
for (const expected of ["Chocolate Hills", "Philippine Tarsier Sanctuary", "Alona Beach", "Loboc River"]) {
  assert.ok(boholAttractions.includes(expected), `Expected Bohol attraction: ${expected}`);
}
assert.ok(
  boholCatalog.attractions.slice(0, 8).every((item) =>
    /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//.test(item.image || "") &&
    !/blank|transparent|spacer|pixel/i.test(item.image)
  ),
  "Bohol's leading attraction cards must use real Wikimedia fallback photography"
);
const boholFood = Object.values(boholCatalog.food).flat();
const boholShopping = boholCatalog.shopping;
const isRealBoholPlace = (item) =>
  item &&
  item.researchPrompt !== true &&
  item.placeholder !== true &&
  Boolean(item.sourceUrl) &&
  !/research checklist/i.test(item.sourceLabel || "");
const hasRelevantRemoteImage = (item) => {
  const image = String(item?.image || "");
  return /^https:\/\//i.test(image) &&
    !/blank|transparent|spacer|pixel|placeholder|restaurant[_ -]plated|shopping[_ -]street|\.svg(?:[?#]|$)/i.test(image);
};

for (const expected of ["Bohol Bee Farm Restaurant", "Gerarda's Family Restaurant"]) {
  assert.ok(boholFood.some((item) => item.name === expected), `Expected recognizable Bohol dining place: ${expected}`);
}
for (const expected of ["Dao Public Market", "Island City Mall"]) {
  assert.ok(boholShopping.some((item) => item.name === expected), `Expected recognizable Bohol shopping place: ${expected}`);
}
for (const bucket of ["breakfast", "lunch", "dinner"]) {
  const leading = boholCatalog.food[bucket][0];
  assert.ok(isRealBoholPlace(leading), `Bohol ${bucket} must lead with a sourced real place, not a researchPrompt placeholder`);
  assert.ok(hasRelevantRemoteImage(leading), `Bohol ${bucket}'s leading real place must have relevant HTTPS photography`);
}
assert.ok(
  boholShopping.slice(0, 3).every(isRealBoholPlace),
  "Bohol shopping must lead with sourced real places, not researchPrompt placeholders"
);
assert.ok(
  boholShopping.slice(0, 3).every(hasRelevantRemoteImage),
  "Bohol's leading shopping places must have relevant HTTPS photography"
);
assert.equal(api.catalogHasSeededAnchors({
  attractions: [{ name: "Generic island walk" }, { name: "Downtown viewpoint" }]
}, "Bohol", { name: "Bohol", country: "Philippines" }), false);
assert.equal(api.catalogHasSeededAnchors(
  boholCatalog,
  "Bohol",
  { name: "Bohol", country: "Philippines" }
), true);

assert.equal(api.hasSeededDestinationCatalog("San Diego, Texas", { name: "San Diego", admin1: "Texas", country: "United States" }), false);
assert.equal(api.hasSeededDestinationCatalog("Hollywood, Florida", { name: "Hollywood", admin1: "Florida", country: "United States" }), false);

const catalogData = JSON.parse(readFileSync("catalogs.json", "utf8"));
const hydratedCatalogs = catalogData.destinationCatalogs.map((entry) => ({ ...entry, match: new RegExp(entry.matchPattern, entry.matchFlags || "i") }));
const catalogFor = (destination) => hydratedCatalogs.find((entry) => entry.match.test(destination));
assert.equal(catalogFor("Paris, Texas"), undefined);
assert.equal(catalogFor("Rome, Georgia"), undefined);
assert.equal(catalogFor("Vancouver, Washington"), undefined);
assert.equal(catalogFor("Kyoto, Japan"), undefined);
assert.ok(catalogFor("Paris, France"));
assert.ok(catalogFor("Rome, Italy"));
assert.ok(catalogFor("Vancouver, Canada"));
assert.ok(catalogFor("Tokyo, Japan"));
const newYorkCatalog = catalogFor("New York City, United States");
assert.ok(newYorkCatalog, "Expected the built-in New York catalog");
const newYorkAttractions = newYorkCatalog.attractions.map((item) => item.name);
for (const expected of ["Statue of Liberty and Ellis Island", "Central Park", "The Metropolitan Museum of Art", "Empire State Building"]) {
  assert.ok(newYorkAttractions.includes(expected), `Expected New York attraction: ${expected}`);
}
assert.ok(newYorkAttractions.some((name) => /Times Square|Broadway/i.test(name)), "Expected Times Square or Broadway recommendation");
assert.ok(newYorkAttractions.some((name) => /Brooklyn Bridge|DUMBO/i.test(name)), "Expected Brooklyn Bridge or DUMBO recommendation");
assert.ok(newYorkCatalog.shopping.some((item) => /Fifth Avenue|SoHo|Chelsea Market/.test(item.name)));
assert.ok(Object.values(newYorkCatalog.food).flat().some((item) => /Katz|Russ|Pizza|Tacos/i.test(item.name)));

let requestCount = 0;
let activeRequests = 0;
let peakRequests = 0;
const networkSandbox = {
  console,
  globalThis: {},
  localStorage: { getItem: () => "", setItem: () => {} },
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  fetch: async (url) => {
    requestCount += 1;
    activeRequests += 1;
    peakRequests = Math.max(peakRequests, activeRequests);
    await new Promise((resolve) => setTimeout(resolve, 12));
    activeRequests -= 1;
    const name = new URL(url).searchParams.get("name") || "Test City";
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ results: [{ name, country: "Exampleland", latitude: 1, longitude: 2, population: 1000 }] })
    };
  }
};
networkSandbox.globalThis = networkSandbox;
vm.runInNewContext(readFileSync("dynamic-catalog.js", "utf8"), networkSandbox, { filename: "dynamic-catalog.js" });
await Promise.all([networkSandbox.geocodeDestination("Coalesce City"), networkSandbox.geocodeDestination("Coalesce City")]);
assert.equal(requestCount, 1, "Identical in-flight requests should be coalesced");
await Promise.all(Array.from({ length: 10 }, (_, index) => networkSandbox.geocodeDestination(`Burst City ${index}`)));
assert.ok(peakRequests <= 6, `Public-source requests exceeded the concurrency cap: ${peakRequests}`);

console.log("dynamic catalog smoke test passed");
