import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const script = readFileSync("app.js", "utf8");
const html = readFileSync("index.html", "utf8");

function functionSource(name) {
  const start = script.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected app.js to define ${name}()`);
  const bodyStart = script.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < script.length; index += 1) {
    if (script[index] === "{") depth += 1;
    if (script[index] === "}") {
      depth -= 1;
      if (!depth) return script.slice(start, index + 1);
    }
  }
  throw new Error(`Could not isolate ${name}()`);
}

const sandbox = {
  knownDestinations: [
    { label: "Tokyo, Japan", aliases: ["tokyo", "tokyo japan"] },
    { label: "London, United Kingdom", aliases: ["london", "london uk"] },
    { label: "New York City, United States", aliases: ["new york", "new york city", "nyc"] }
  ]
};
vm.createContext(sandbox);
vm.runInContext(
  [
    functionSource("normalizeDestinationName"),
    functionSource("resolveKnownDestination"),
    functionSource("destinationEditDistance"),
    functionSource("suggestKnownDestination")
  ].join("\n"),
  sandbox
);

assert.equal(sandbox.destinationEditDistance("tokoyo", "tokyo"), 1, "Transposed letters should count as one typo");
assert.equal(sandbox.suggestKnownDestination("Tokoyo")?.label, "Tokyo, Japan", "A common Tokyo typo should offer the catalog destination");
assert.equal(sandbox.suggestKnownDestination("Londn")?.label, "London, United Kingdom", "A missing letter should offer London");
assert.equal(sandbox.suggestKnownDestination("asasdasd"), null, "Random letters must not produce a misleading destination suggestion");

assert.match(html, /id="destinationSuggestionButton"[^>]*hidden/, "Trip Basics must include an initially hidden typo-correction action");
assert.match(script, /const typoSuggestion = suggestKnownDestination\(enteredDestination\)/, "Destination validation must check local typo suggestions");
assert.match(script, /verifiedGeocode = await geocodeDestination\(researchDestination/, "Unknown destinations must be geocoded before Adventure");
assert.match(script, /if \(!existingCatalog && !verifiedGeocode\)[\s\S]{0,900}?We couldn’t find/, "Unresolved destinations must be blocked with a specific message");
assert.match(script, /destinationInput\.focus\(\);\s*return;\s*}\s*destinationInput\.setCustomValidity\(""\)/, "The invalid-destination branch must return before Adventure renders");

console.log("Destination validation smoke tests passed.");
