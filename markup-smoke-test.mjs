import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const html = readFileSync("index.html", "utf8");
const versionSource = readFileSync("version.js", "utf8");
const stylesheet = readFileSync("styles.css");
const exportStylesSource = readFileSync("export-styles.js", "utf8");

const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
assert.deepEqual(duplicateIds, [], `index.html contains duplicate IDs: ${duplicateIds.join(", ")}`);

const appNavIndex = html.indexOf('<nav class="app-nav"');
const appFootnoteIndex = html.indexOf('<p class="form-footnote app-footnote"');
assert.ok(appNavIndex >= 0, "Generated trip app must include the bottom navigation");
assert.ok(appFootnoteIndex > appNavIndex, "Public-beta footnote must render below the bottom navigation");

assert.ok(html.includes('class="site-footer landing-footer"'), "Trip Basics must include the compact Adtona footer");
assert.ok(html.includes('data-open-learn-more'), "The footer must expose a Learn More action");
assert.ok(html.includes('data-open-feedback'), "The footer must expose Send feedback");
assert.ok(html.includes('data-open-privacy'), "The footer must expose Privacy");
assert.ok(html.includes('id="learnMoreDialog"'), "Learn More must open a dedicated information lightbox");
assert.ok(html.includes('id="learnMoreDialogTitle"'), "The Learn More lightbox must have an accessible title");
// The welcome screen stays decluttered by keeping the long-form copy out of the hero and
// below the fold — not by deleting it. Search engines discount text inside a closed
// <dialog>, so a crawlable section has to exist somewhere in the page; what matters is
// that it never intrudes on the wizard, which is gated in CSS off body.trip-basics-mode.
assert.ok(html.includes('class="landing-about"'), "A crawlable product description must stay in the page for search engines");
assert.ok(
  html.indexOf('class="landing-about"') > html.indexOf('class="trip-basics-action-row'),
  "The crawlable description must sit below the welcome screen's actions, not above them"
);
assert.match(
  stylesheet.toString("utf8"),
  /body:not\(\.trip-basics-mode\)\s*\.landing-about\s*\{\s*display:\s*none;?\s*\}/,
  "The crawlable description must be hidden once the traveler leaves step 1"
);
const markupOnly = html.replace(/<!--[\s\S]*?-->/g, "");
const aboutOffset = markupOnly.indexOf('class="landing-about"');
const dialogRanges = [...markupOnly.matchAll(/<dialog\b/g)].map((match) => [
  match.index,
  markupOnly.indexOf("</dialog>", match.index)
]);
assert.ok(
  !dialogRanges.some(([start, end]) => aboutOffset > start && aboutOffset < end),
  "The description must be page content — a closed <dialog> is display:none and gets discounted"
);

const version = versionSource.match(/ADTONA_VERSION\s*=\s*["']([^"']+)/)?.[1];
assert.ok(version, "version.js must define ADTONA_VERSION");
assert.match(versionSource, /PLANTOGUIDE_VERSION\s*=\s*globalThis\.ADTONA_VERSION/, "version.js must retain the PlanToGuide compatibility alias");
const assetVersions = [...html.matchAll(/(?:styles\.css|(?:version|dynamic-catalog|export-styles|icon-source|photo-store|trip-schema|beta-tools|app)\.js)\?v=([^"']+)/g)].map((match) => match[1]);
assert.ok(assetVersions.length >= 9, "index.html should version every core stylesheet and script");
assert.ok(assetVersions.every((assetVersion) => assetVersion === version), "All index.html cache versions must match version.js");

const encodedStyles = exportStylesSource.match(/XTRAVEL_STYLES_GZIP_BASE64\s*=\s*["']([^"']+)/)?.[1];
assert.ok(encodedStyles, "export-styles.js must contain the compressed stylesheet fallback");
const exportedStylesheet = gunzipSync(Buffer.from(encodedStyles, "base64"));
assert.ok(stylesheet.equals(exportedStylesheet), "export-styles.js must be rebuilt whenever styles.css changes");

console.log("Markup and export-style smoke test passed.");
