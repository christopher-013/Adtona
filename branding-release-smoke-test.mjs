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

const jsonLdText = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
assert.ok(jsonLdText, "The page must include JSON-LD");
const graph = JSON.parse(jsonLdText)["@graph"];
const appSchema = graph.find((entry) => entry["@type"] === "WebApplication");
const faqSchema = graph.find((entry) => entry["@type"] === "FAQPage");
assert.equal(appSchema?.name, "Adtona");
assert.equal(appSchema?.isAccessibleForFree, true);
assert.equal(faqSchema?.mainEntity?.length, 6, "Structured data must publish the six visible FAQs");
faqSchema.mainEntity.forEach((faq) => {
  assert.ok(html.includes(`<dt>${faq.name}</dt>`), `Visible FAQ is missing: ${faq.name}`);
  assert.ok(html.includes(`<dd>${faq.acceptedAnswer.text}</dd>`), `Visible FAQ answer differs from JSON-LD: ${faq.name}`);
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

assert.match(versionSource, /ADTONA_VERSION\s*=\s*"5.6.0"/);
assert.match(versionSource, /PLANTOGUIDE_VERSION\s*=\s*globalThis\.ADTONA_VERSION/);
assert.equal(packageJson.version, "5.6.0");
assert.match(serverSource, /McpServer\(\{ name: "plantoguide", version: "5.6.0" \}\)/);
assert.match(serviceWorker, /`adtona-\$\{RELEASE_VERSION\}`/);
assert.match(app, /ADTONA-TRIP-PLAN\.md/);
assert.match(app, /ADTONA-TRIP-DATA\.json/);
assert.match(app, /name: "TRIP-PLAN\.md"/);
assert.match(app, /name: "TRIP-DATA\.json"/);
assert.match(app, /json plantoguide-trip/);
assert.match(schema, /"xtravel-trip"/);

console.log("Adtona public-release branding smoke test passed.");
