import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const app = readFileSync("app.js", "utf8");
const schema = readFileSync("trip-schema.js", "utf8");
const manifest = JSON.parse(readFileSync("manifest.webmanifest", "utf8"));
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const versionSource = readFileSync("version.js", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");
const serverSource = readFileSync("server.mjs", "utf8");

assert.match(html, /<title>Adtona — Free AI Travel Planner &amp; Itinerary Builder<\/title>/);
assert.match(html, /<meta name="description" content="Build a shareable trip website, printable itinerary, and AI-ready planning file—free in your browser\. No account or API key required\.">/);
assert.match(html, /<link rel="canonical" href="https:\/\/adtona\.com\/">/);
assert.match(html, /<h1>Plan the trip\. Build the guide\. Go Now\.<\/h1>/);
assert.match(html, /<p class="eyebrow">Free AI travel planner<\/p>/);
assert.match(html, /Adtona was inspired by the Bisaya \(Cebuano\) phrase “Adto na”—“Go now\.”/);
assert.match(html, /Export\. Refine\. Re-import\. Keep one source of truth\./);

// The Instagram profile is the one outbound link the site owns, so it must survive
// markup edits: three footer banners, the Learn More dialog, and the generated
// trip site's header. It is an editorial link, so it must not carry nofollow.
const instagramLinks = html.match(/<a[^>]*href="https:\/\/www\.instagram\.com\/adto\.na\/"[^>]*>/g) ?? [];
assert.equal(instagramLinks.length, 5, "Every Adtona Instagram entry point must be present");
instagramLinks.forEach((tag) => {
  assert.match(tag, /rel="noopener noreferrer"/, `Instagram link needs safe rel: ${tag}`);
  assert.match(tag, /target="_blank"/, `Instagram link must open in a new tab: ${tag}`);
  assert.doesNotMatch(tag, /nofollow/, `The site's own profile link must stay followable: ${tag}`);
});
assert.match(html, /class="learn-more-social"/, "Learn More must close with the Instagram link");
// The footer banners spell the invitation out; the header has no room for it and
// shows the mark alone, so its accessible name has to come from the label.
const footerLinks = html.match(/<a class="footer-link instagram-link"[^>]*>Adtona on Instagram<\/a>/g) ?? [];
assert.equal(footerLinks.length, 3, "All three footer banners must link the profile by name");
const headerMark = html.match(/<a class="export-button social-header-link"[^>]*>/)?.[0];
assert.ok(headerMark, "The generated trip header must carry the Instagram link");
assert.match(headerMark, /aria-label="Adtona on Instagram"/, "The icon-only header link needs a name");
assert.equal((html.match(/class="instagram-glyph"/g) ?? []).length, 2, "Only Learn More and the trip header show the mark");
assert.doesNotMatch(html, /social-header-link"[^>]*>[^<]*Instagram/, "The header link is icon-only");

const jsonLdText = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
assert.ok(jsonLdText, "The page must include JSON-LD");
const graph = JSON.parse(jsonLdText)["@graph"];
const appSchema = graph.find((entry) => entry["@type"] === "WebApplication");
assert.equal(appSchema?.name, "Adtona");
assert.equal(appSchema?.isAccessibleForFree, true);

// The FAQ moved to /about with the prose it belongs to. Google requires the
// answers to be visible on the page carrying the markup, so the welcome screen
// must not claim FAQ content it no longer shows, and the about page must show
// every question it declares.
assert.ok(
  !graph.some((entry) => entry["@type"] === "FAQPage"),
  "The welcome screen must not claim FAQ content it does not show"
);
const aboutHtml = readFileSync("about.html", "utf8");
const aboutGraph = JSON.parse(
  aboutHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]
)["@graph"];
const aboutFaq = aboutGraph.find((entry) => entry["@type"] === "FAQPage");
assert.equal(aboutFaq?.mainEntity?.length, 6, "The about page must publish the six FAQs");
for (const question of aboutFaq.mainEntity) {
  assert.ok(
    aboutHtml.includes(`<dt>${question.name}</dt>`),
    `The about page must show "${question.name}" as visible text`
  );
}
assert.match(html, /href="\/about"/, "The welcome screen must link to the about page");
// The answer text must match too, not just the question: a summary in the
// markup and a fuller answer on the page is the mismatch Google acts on.
aboutFaq.mainEntity.forEach((faq) => {
  assert.ok(
    aboutHtml.includes(`<dd>${faq.acceptedAnswer.text}</dd>`),
    `Visible FAQ answer differs from JSON-LD: ${faq.name}`
  );
});

assert.equal(manifest.name, "Adtona — AI Travel Planner");
assert.equal(manifest.short_name, "Adtona");
assert.equal(manifest.description, "Plan the trip. Build the guide. Go Now.");
for (const icon of [
  "icons/favicon-16.png",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "icons/maskable-192.png",
  "icons/maskable-512.png",
  "icons/adtona-social-1200x630.png"
]) assert.ok(existsSync(icon), `Missing release asset: ${icon}`);

// Bing resolves its SERP icon from /favicon.ico and shows a generic globe when it 404s,
// so the root .ico is a release asset in its own right — not just a copy of the PNGs.
// It must carry 48px: that is the size both Bing and Google render at on dense screens.
const ico = readFileSync("favicon.ico");
assert.equal(ico.readUInt16LE(0), 0, "favicon.ico must start with a valid ICONDIR");
assert.equal(ico.readUInt16LE(2), 1, "favicon.ico must be an icon resource, not a cursor");
const icoSizes = Array.from({ length: ico.readUInt16LE(4) }, (_, index) => ico[6 + index * 16] || 256);
assert.deepEqual(icoSizes, [16, 32, 48], "favicon.ico must carry 16, 32 and 48 px entries");
assert.match(html, /<link rel="icon" href="\/favicon\.ico"/, "The root favicon must be declared for crawlers");

function pngDimensions(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString("ascii", 1, 4), "PNG", `${path} must be a PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

assert.deepEqual(pngDimensions("icons/favicon-16.png"), [16, 16]);
assert.deepEqual(pngDimensions("icons/favicon-32.png"), [32, 32]);
assert.deepEqual(pngDimensions("icons/icon-192.png"), [192, 192]);
assert.deepEqual(pngDimensions("icons/icon-512.png"), [512, 512]);
assert.deepEqual(pngDimensions("icons/apple-touch-icon.png"), [180, 180]);
assert.deepEqual(pngDimensions("icons/maskable-192.png"), [192, 192]);
assert.deepEqual(pngDimensions("icons/maskable-512.png"), [512, 512]);
assert.deepEqual(pngDimensions("icons/adtona-social-1200x630.png"), [1200, 630]);

assert.match(versionSource, /ADTONA_VERSION\s*=\s*"5.7.1"/);
assert.match(versionSource, /PLANTOGUIDE_VERSION\s*=\s*globalThis\.ADTONA_VERSION/);
assert.equal(packageJson.version, "5.7.1");
assert.match(serverSource, /McpServer\(\{ name: "plantoguide", version: "5.7.1" \}\)/);
assert.match(serviceWorker, /`adtona-\$\{RELEASE_VERSION\}`/);
assert.match(app, /ADTONA-TRIP-PLAN\.md/);
assert.match(app, /ADTONA-TRIP-DATA\.json/);
assert.match(app, /name: "TRIP-PLAN\.md"/);
assert.match(app, /name: "TRIP-DATA\.json"/);
assert.match(app, /json plantoguide-trip/);
assert.match(schema, /"xtravel-trip"/);

console.log("Adtona public-release branding smoke test passed.");
