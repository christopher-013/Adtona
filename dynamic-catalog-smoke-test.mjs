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

// Progressive mobile research and the final desktop/precomputed path can encounter duplicate
// Wikipedia records in a different order. The richer copy's popularity and photo must survive
// either merge order so Manila always leads with the same well-known, photographed attraction.
const manilaRizalPhoto = "https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Rizal_Monument_at_Rizal_Park.jpg/640px-Rizal_Monument_at_Rizal_Park.jpg";
const manilaRizalSparse = {
  name: "Rizal Park (Luneta)",
  type: "see",
  area: "Manila",
  detail: "Manila's central urban park and national monument.",
  image: "",
  popularity: 0,
  rankBoost: 0,
  sourceLabel: "Wikipedia",
  sourceId: "wikipedia:rizal-geo"
};
const manilaRizalEnriched = {
  ...manilaRizalSparse,
  image: manilaRizalPhoto,
  popularity: 5200,
  rankBoost: 44,
  sourceLabel: "Wikipedia category",
  sourceId: "wikipedia:rizal-category"
};
const manilaIntramuros = {
  name: "Intramuros",
  type: "see",
  area: "Manila",
  detail: "Manila's historic walled district.",
  popularity: 800,
  rankBoost: 30,
  sourceLabel: "Wikipedia category",
  sourceId: "wikipedia:intramuros"
};
const manilaFortSantiago = {
  name: "Fort Santiago",
  type: "see",
  area: "Manila",
  detail: "A historic citadel in Manila.",
  popularity: 120,
  sourceLabel: "Wikipedia",
  sourceId: "wikipedia:fort-santiago"
};
const manilaSourceOrders = [
  {
    label: "partial-first source order",
    items: [manilaRizalSparse, manilaIntramuros, manilaFortSantiago, manilaRizalEnriched]
  },
  {
    label: "final-first source order",
    items: [manilaRizalEnriched, manilaFortSantiago, manilaIntramuros, manilaRizalSparse]
  }
];
for (const scenario of manilaSourceOrders) {
  const manilaCatalog = api.assembleDynamicCatalog("Manila", {
    name: "Manila",
    admin1: "Metro Manila",
    country: "Philippines"
  }, {
    wikipediaItems: scenario.items
  });
  assert.equal(
    manilaCatalog.attractions[0].name,
    "Rizal Park (Luneta)",
    `Manila must lead with the same most-popular attraction for ${scenario.label}`
  );
  assert.equal(
    manilaCatalog.attractions[0].image,
    manilaRizalPhoto,
    `Manila's first attraction must retain its available photo for ${scenario.label}`
  );
}

const manilaOfflineBaseline = api.assembleDynamicCatalog("Manila", {
  name: "Manila",
  admin1: "Metro Manila",
  country: "Philippines"
}, {});
assert.equal(
  manilaOfflineBaseline.attractions[0].name,
  "Rizal Park (Luneta)",
  "Manila must keep a stable first recommendation even when a live source is unavailable"
);
assert.match(
  manilaOfflineBaseline.attractions[0].image,
  /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/Rizal_Park\.jpg\?/,
  "Manila's stable first recommendation must ship with its exact Commons photo"
);
assert.equal(
  manilaOfflineBaseline.food.breakfast[0].name,
  "Café Adriatico",
  "Manila's food deck must open with the same source-backed local institution on every device"
);
assert.match(
  manilaOfflineBaseline.food.breakfast[0].image,
  /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/Cafe_Adriatico%2C_Malate%2C_Manila%2C_Mar_2024\.jpg\?/,
  "Manila's opening food recommendation must ship with its exact Commons photo"
);
assert.equal(
  manilaOfflineBaseline.shopping[0].name,
  "Divisoria Market",
  "Manila's shopping deck must open with the same source-backed market on every device"
);
assert.match(
  manilaOfflineBaseline.shopping[0].image,
  /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/Divisoria_San_Nicolas_Binondo_Districts_05\.jpg\?/,
  "Manila's opening shopping recommendation must ship with its exact Commons photo"
);
const manilaUnevenSourceCatalog = api.assembleDynamicCatalog("Manila", {
  name: "Manila",
  admin1: "Metro Manila",
  country: "Philippines"
}, {
  wikivoyageItems: [{
    name: "Intramuros",
    type: "see",
    area: "Manila",
    detail: "Manila's historic walled district.",
    wikivoyageRank: 0,
    popularity: 100000,
    rankBoost: 100,
    sourceLabel: "Wikivoyage",
    sourceId: "wikivoyage:intramuros"
  }]
});
assert.equal(
  manilaUnevenSourceCatalog.attractions[0].name,
  "Rizal Park (Luneta)",
  "Manila's canonical opening card must not change when one device receives stronger metadata for a competing place"
);
assert.equal(
  api.catalogHasResearchDepth(manilaOfflineBaseline, "Manila", {
    name: "Manila",
    admin1: "Metro Manila",
    country: "Philippines"
  }),
  true,
  "The source-backed Manila baseline must pass the runtime cache quality gate"
);
assert.equal(
  api.catalogHasResearchDepth({
    attractions: [{ name: "Intramuros", sourceLabel: "Wikipedia category", image: "" }],
    food: { breakfast: [], lunch: [], dinner: [] },
    shopping: []
  }, "Example City", { name: "Example City", country: "Exampleland" }),
  false,
  "A thin, imageless device-local result must remain retryable instead of being cached"
);

const imagelessLeadingCatalog = structuredClone(manilaOfflineBaseline);
imagelessLeadingCatalog.attractions[0].image = "";
assert.equal(
  api.catalogHasResearchDepth(imagelessLeadingCatalog, "Manila", {
    name: "Manila",
    admin1: "Metro Manila",
    country: "Philippines"
  }),
  false,
  "An otherwise complete catalog with an imageless leading card must remain retryable"
);

const exampleAttractions = [
  { name: "Example City Museum", type: "see", detail: "A city museum.", sourceLabel: "Wikipedia", sourceId: "wikipedia:example-museum" },
  { name: "Example City Park", type: "see", detail: "A city park.", sourceLabel: "Wikipedia", sourceId: "wikipedia:example-park" }
];
const osmOrderingCatalog = api.assembleDynamicCatalog("Example City", {
  name: "Example City",
  country: "Exampleland"
}, {
  wikipediaItems: exampleAttractions,
  osmItems: [
    {
      name: "Alpha Cafe",
      type: "eat",
      area: "Center",
      cuisine: "Cafe",
      detail: "A cafe.",
      osmScore: 10,
      sourceLabel: "OpenStreetMap",
      sourceId: "osm:node/1"
    },
    {
      name: "Zeta Cafe",
      type: "eat",
      area: "Center",
      cuisine: "Cafe",
      detail: "A cafe.",
      osmScore: 90,
      sourceLabel: "OpenStreetMap",
      sourceId: "osm:node/2"
    }
  ]
});
assert.equal(
  osmOrderingCatalog.food.breakfast[0].name,
  "Zeta Cafe",
  "OSM popularity must remain the deterministic tie-breaker instead of alphabetical order"
);

for (const categoryRecords of [
  [
    { name: "Example Market", type: "see", sourceLabel: "Wikipedia", sourceId: "wikipedia:market-geo" },
    { name: "Example Market", type: "buy", bestFor: "Local goods", sourceLabel: "Wikipedia category", sourceId: "wikipedia-category:market" }
  ],
  [
    { name: "Example Market", type: "buy", bestFor: "Local goods", sourceLabel: "Wikipedia category", sourceId: "wikipedia-category:market" },
    { name: "Example Market", type: "see", sourceLabel: "Wikipedia", sourceId: "wikipedia:market-geo" }
  ]
]) {
  const categoryCatalog = api.assembleDynamicCatalog("Example City", {
    name: "Example City",
    country: "Exampleland"
  }, {
    wikipediaItems: [...exampleAttractions, ...categoryRecords]
  });
  assert.equal(
    categoryCatalog.shopping[0].name,
    "Example Market",
    "A category-specific shopping record must beat a generic geosearch attraction in either source order"
  );
  assert.ok(
    !categoryCatalog.attractions.some((item) => item.name === "Example Market"),
    "The merged shopping place must not leak into Places to see"
  );
}

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

// Category correctness: Wikivoyage's {{drink}} template covers bars and nightclubs as well
// as cafes, so mapping it wholesale onto "eat" listed a dance club under "Places to eat".
// Food-serving drink listings must survive; pure nightlife must not reach the eat category.
const categoryWikitext = [
  "{{drink|name=Club Atom / STUDIO-A|content=Owned by Vanilla, this club houses three dance floors with music ranging from psychedelic trance to hip-hop.}}",
  "{{drink|name=Blue Note Tokyo|content=Famous jazz club with live music every night.}}",
  "{{drink|name=Cafe de l'Ambre|content=Long-standing coffee house roasting its own aged beans.}}",
  "{{drink|name=Sakura Tea House|content=Traditional tea room serving matcha and wagashi.}}",
  "{{eat|name=Sukiyabashi Jiro|content=Michelin-starred sushi restaurant.}}",
  "{{eat|name=Karaoke Kan Bar|content=Karaoke rooms with a full drinks list and a dance floor.}}",
  "{{see|name=Senso-ji|content=Ancient Buddhist temple in Asakusa.}}",
  "{{buy|name=Nakamise Shopping Street|content=Souvenir stalls leading to the temple.}}"
].join("\n");
const categoryItems = api.parseWikivoyageListings(categoryWikitext, "Tokyo");
const eatNames = categoryItems.filter((item) => item.type === "eat").map((item) => item.name);
// Nothing from the {{drink}} section becomes a place to eat: it is the bar/pub/nightclub
// list, and a food-sounding name is not evidence ("Cafe de Jumpin'" is an Osaka nightclub).
for (const drinkListing of ["Club Atom / STUDIO-A", "Blue Note Tokyo", "Cafe de l'Ambre", "Sakura Tea House"]) {
  assert.ok(!eatNames.includes(drinkListing), `Drink-section listings must not be places to eat: ${drinkListing}`);
}
assert.ok(!eatNames.includes("Karaoke Kan Bar"), "An {{eat}} listing that reads as nightlife must still be rejected");
assert.ok(eatNames.includes("Sukiyabashi Jiro"), "Genuine {{eat}} listings must remain places to eat");
assert.ok(categoryItems.some((item) => item.name === "Senso-ji" && item.type === "see"), "Sights must stay in the see category");
assert.ok(categoryItems.some((item) => item.name === "Nakamise Shopping Street" && item.type === "buy"), "Shopping must stay in the buy category");

// Wikivoyage lists the best-known places first, so each listing keeps its position within
// its own section; the ranker leads with the opening Eat entries for uncurated cities.
const orderWikitext = [
  "{{eat|name=First Eat|content=Famous restaurant.}}",
  "{{eat|name=Second Eat|content=Another restaurant.}}",
  "{{eat|name=Third Eat|content=A third restaurant.}}",
  "{{see|name=First Sight|content=A landmark.}}"
].join("\n");
const ordered = api.parseWikivoyageListings(orderWikitext, "Osaka");
const orderedEat = ordered.filter((item) => item.type === "eat");
// Array.from rebuilds the list in this realm: the parsed items come from a vm context, and
// deepStrictEqual compares prototypes, so a mapped array from there never matches.
assert.deepEqual(Array.from(orderedEat, (item) => item.wikivoyageRank), [0, 1, 2], "Eat listings must keep their section order");
assert.equal(ordered.find((item) => item.type === "see").wikivoyageRank, 0, "Section order is tracked per category, not globally");
assert.ok(orderedEat[0].wikivoyageRank < orderedEat[2].wikivoyageRank, "Earlier Eat listings must outrank later ones");



// Dining fallback: when Wikivoyage and OpenStreetMap return few real places to eat, the
// Wikipedia category path must still produce named restaurants rather than leaving the
// deck to "<city> neighbourhood cafe" filler. A restaurant article rarely says so in its
// title ("Canlis"), so the category a page came from is what types it.
const categoryFetch = async (url) => {
  const text = decodeURIComponent(String(url)).replace(/\+/g, " ");
  if (text.includes("incategory:")) {
    const category = text.match(/incategory:"([^"]+)"/)?.[1] || "";
    const members = {
      "Restaurants in Seattle": [{ pageid: 1, title: "Canlis" }, { pageid: 2, title: "Pike Place Chowder" }],
      "Coffeehouses in Seattle": [{ pageid: 3, title: "Starbucks Reserve Roastery" }],
      "Tourist attractions in Seattle": [{ pageid: 4, title: "Space Needle" }],
      "Shopping malls in Seattle": [{ pageid: 5, title: "Westlake Center" }]
    }[category] || [];
    return { ok: true, json: async () => ({ query: { search: members } }) };
  }
  if (text.includes("pageids=")) {
    return { ok: true, json: async () => ({ query: { pages: {
      1: { pageid: 1, title: "Canlis", extract: "Fine dining restaurant in Seattle." },
      2: { pageid: 2, title: "Pike Place Chowder", extract: "Seafood counter in Seattle." },
      3: { pageid: 3, title: "Starbucks Reserve Roastery", extract: "Coffee roastery in Seattle." },
      4: { pageid: 4, title: "Space Needle", extract: "Observation tower in Seattle." },
      5: { pageid: 5, title: "Westlake Center", extract: "A shopping mall in downtown Seattle." }
    } } }) };
  }
  return { ok: true, json: async () => ({}) };
};
const categorySandbox = {
  console, globalThis: {}, localStorage: { getItem: () => "", setItem: () => {} },
  URL, AbortController, setTimeout, clearTimeout, fetch: categoryFetch
};
categorySandbox.globalThis = categorySandbox;
vm.runInNewContext(readFileSync("dynamic-catalog.js", "utf8"), categorySandbox, { filename: "dynamic-catalog.js" });
const categoryPlaces = await categorySandbox.fetchWikipediaCategoryPlaces("Seattle", { name: "Seattle" });
const namesOfType = (type) => categoryPlaces.filter((item) => item.type === type).map((item) => item.name);
for (const restaurant of ["Canlis", "Pike Place Chowder", "Starbucks Reserve Roastery"]) {
  assert.ok(namesOfType("eat").includes(restaurant), `Wikipedia dining categories must supply real places to eat: ${restaurant}`);
}
assert.ok(namesOfType("see").includes("Space Needle"), "Sightseeing categories must still produce see items");
assert.ok(namesOfType("buy").includes("Westlake Center"), "Shopping categories must type their members as buy even when the title does not say so");

console.log("dynamic catalog smoke test passed");
