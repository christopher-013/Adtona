import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import vm from "node:vm";

const source = readFileSync("app.js", "utf8");
assert.match(source, /const MAX_SUGGESTION_IMAGE_LOOKUPS = 2;/, "Mobile-safe image lookup concurrency must stay bounded");
assert.match(source, /const maxAttempts = 3;/, "Image API requests must retry transient mobile failures");
assert.match(source, /setTimeout\(\(\) => controller\.abort\(\), 9000\)/, "Image API requests must have a hard timeout");
assert.match(source, /suggestionImageMissState/, "Temporary image misses must expire and remain retryable");
assert.match(source, /catalogImageFailed/, "Failed catalog images must trigger an exact-place recovery lookup");
assert.match(source, /forceRefresh: true/, "Image recovery must bypass a stale miss cache");
const helperStart = source.indexOf("const IMAGE_MATCH_STOP_WORDS");
const helperEnd = source.indexOf("function isRemoteSuggestionImage", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "Suggestion image helper block must remain testable");

const sandbox = { URL };
sandbox.globalThis = sandbox;
vm.runInNewContext(
  `${source.slice(helperStart, helperEnd)}
  globalThis.imageTestApi = {
    suggestionImageContextTokens,
    suggestionImageSearchQuery,
    imagePageMatchScore,
    bestMatchingImagePage
  };`,
  sandbox,
  { filename: "app-image-helpers.js" }
);

const api = sandbox.imageTestApi;
const destination = "Tokyo, Japan";
const suggestion = {
  name: "Peter",
  category: "eat",
  address: "24th Floor, The Peninsula Tokyo hotel",
  officialUrl: "https://www.peninsula.com/en/tokyo/hotel-fine-dining/peter-modern-french",
  cuisine: "Modern French"
};

assert.deepEqual(
  [...api.suggestionImageContextTokens(suggestion, destination)],
  ["peninsula"],
  "The official venue brand must disambiguate the one-word restaurant name"
);
const searchQuery = api.suggestionImageSearchQuery(suggestion, destination);
assert.match(searchQuery, /peninsula/i);
assert.doesNotMatch(searchQuery, /^peter\s+tokyo/i, "Ambiguous venues must never use a bare name-and-city image query");

const page = (title, index) => ({
  title,
  index,
  imageinfo: [{ thumburl: `https://upload.wikimedia.org/${index}.jpg`, url: `https://upload.wikimedia.org/${index}.jpg` }]
});
const unrelated = [
  page("File:Professor Peter Davies in Tokyo, Japan, October 2011.jpg", 1),
  page("File:Peter Lax in Tokyo.jpg", 2),
  page("File:Peter Pan's Flight Tokyo Disneyland.jpg", 3),
  page("File:Peter Luger Tokyo location.jpg", 4),
  page("File:Detail of Antique Rolls-Royce - Outside Peninsula Hotel - Ginza - Tokyo - Japan.jpg", 5)
];
for (const candidate of unrelated) {
  assert.equal(
    api.imagePageMatchScore(candidate, suggestion, destination),
    -1,
    `Unrelated candidate must be rejected: ${candidate.title}`
  );
}

const venue = page("File:The Peninsula Tokyo.jpg", 6);
assert.ok(api.imagePageMatchScore(venue, suggestion, destination) >= 5);
const selected = api.bestMatchingImagePage(
  { query: { pages: Object.fromEntries([...unrelated, venue].map((candidate, index) => [index + 1, candidate])) } },
  suggestion,
  destination
);
assert.equal(selected.title, venue.title, "Peter must resolve to The Peninsula Tokyo venue image");

assert.equal(
  api.bestMatchingImagePage(
    { query: { pages: Object.fromEntries(unrelated.map((candidate, index) => [index + 1, candidate])) } },
    suggestion,
    destination
  ),
  null,
  "A venue-image miss must fall back instead of displaying an unrelated Peter"
);

const later = page("File:The Peninsula Tokyo exterior A.jpg", 9);
const earlier = page("File:The Peninsula Tokyo exterior B.jpg", 2);
assert.equal(
  api.bestMatchingImagePage({ query: { pages: { later, earlier } } }, suggestion, destination).index,
  2,
  "Equal-scoring results must honor MediaWiki search order"
);

console.log("suggestion image smoke test passed");
