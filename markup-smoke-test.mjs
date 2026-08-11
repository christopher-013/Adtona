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
// Search engines discount text inside a closed <dialog>, so a crawlable
// description has to exist — but it belongs on a page of its own rather than
// bolted under the welcome screen, which keeps the wizard uncluttered and gives
// the copy somewhere that can rank on its own.
assert.ok(
  !html.includes('class="landing-about"'),
  "The long-form copy belongs on /about, not under the welcome screen"
);
assert.match(html, /href="\/about"/, "The welcome screen must link to the about page");

const aboutPage = readFileSync("about.html", "utf8");
const aboutMarkupOnly = aboutPage.replace(/<!--[\s\S]*?-->/g, "");
assert.ok(aboutMarkupOnly.length > 3000, "The about page must carry the description, not a stub");
assert.match(
  aboutMarkupOnly,
  /rel="canonical" href="https:\/\/adtona\.com\/about"/,
  "The about page must declare its own canonical URL"
);
assert.ok(
  !aboutMarkupOnly.includes("<dialog"),
  "The description must be page content — a closed <dialog> is display:none and gets discounted"
);
assert.ok(
  JSON.parse(readFileSync("build-cloudflare.mjs", "utf8").includes('"about.html"') ? "true" : "false"),
  "about.html must ship with the deploy"
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
