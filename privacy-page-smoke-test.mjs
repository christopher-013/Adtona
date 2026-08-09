import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderPrivacyPage } from "./build-privacy-page.mjs";

// privacy.html is generated from the privacy dialog in index.html. The point of generating
// it is that the two can never disagree, so the test that matters is: does a fresh render
// reproduce the file that is checked in? If not, someone edited the dialog and did not
// rebuild — and adtona.com would be publishing a privacy notice that no longer describes
// the app. Rendering in-process rather than shelling out keeps the test read-only.
const committed = readFileSync("privacy.html", "utf8");
assert.equal(
  renderPrivacyPage(),
  committed,
  "privacy.html is stale — run `node build-privacy-page.mjs` after editing the privacy dialog"
);

const html = readFileSync("index.html", "utf8");
const version = readFileSync("version.js", "utf8").match(/ADTONA_VERSION\s*=\s*"([^"]+)"/)?.[1];

// A second indexable URL only helps if it is actually reachable and self-describing.
assert.match(committed, /<link rel="canonical" href="https:\/\/adtona\.com\/privacy">/, "The privacy page must declare its own canonical");
assert.match(committed, /<title>Privacy — Adtona<\/title>/);
assert.match(committed, /<meta name="description" content="[^"]{80,}">/, "The privacy page needs its own description for the snippet");
assert.match(committed, /<meta name="robots" content="index, follow/, "The privacy page must be indexable");
assert.match(committed, /<link rel="icon" href="\/favicon\.ico"/, "The privacy page must carry the root favicon too");
assert.match(committed, /script-src 'none'/, "A static text page should run no script at all");
assert.doesNotMatch(committed, /<script/, "The privacy page must stay script-free");
assert.equal((committed.match(/<h1>/g) ?? []).length, 1, "Exactly one h1");
assert.ok((committed.match(/<h2>/g) ?? []).length >= 8, "Every privacy section must survive the conversion");
assert.doesNotMatch(committed, /<h3>/, "Headings must be promoted a level on a page of its own");

// Orphan pages rank poorly, so the homepage has to link to it in crawlable text — the
// footer's Privacy control is a <button> that opens the dialog and is not a link at all.
assert.match(html, /<a href="\/privacy">/, "The homepage must link to /privacy from visible page content");

const sitemap = readFileSync("sitemap.xml", "utf8");
assert.match(sitemap, /<loc>https:\/\/adtona\.com\/<\/loc>/);
assert.match(sitemap, /<loc>https:\/\/adtona\.com\/privacy<\/loc>/, "The sitemap must list the privacy page");
assert.doesNotMatch(
  sitemap.replace(/<!--[\s\S]*?-->/g, ""),
  /privacy\.html/,
  "List the extensionless URL: /privacy.html only 307s to it"
);

// The stylesheet is cache-busted like every other asset, so it must track the release.
assert.ok(committed.includes(`privacy.css?v=${version}`), "The privacy stylesheet must carry the current release version");

const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"];
const appSchema = graph.find((entry) => entry["@type"] === "WebApplication");
assert.equal(appSchema.privacyPolicy, "https://adtona.com/privacy", "Structured data must point at the real privacy URL");
assert.equal(appSchema.softwareVersion, version, "softwareVersion in JSON-LD must match version.js");
assert.ok(graph.some((entry) => entry["@type"] === "WebPage"), "The graph must describe the page itself, not only the site and the app");

console.log("Privacy page smoke test passed.");
