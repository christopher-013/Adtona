// Security smoke test — static guardrails that run in CI (npm run check / npm run smoke)
// so a build can't regress the site's security posture. All checks are static file scans;
// no network, no browser. Keep the patterns specific to avoid false positives (the public
// Cloudflare beacon token is a plain 32-hex value and must never trip the secret scan).
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : "");

// Files that run in the visitor's browser — these must stay XSS-safe.
const BROWSER_FILES = [
  "index.html", "app.js", "dynamic-catalog.js", "beta-tools.js",
  "trip-schema.js", "photo-store.js", "icon-source.js", "sw.js"
];
// Everything we scan for accidentally-committed secrets (public repo).
const SECRET_SCAN_FILES = [
  ...BROWSER_FILES, "export-styles.js", "version.js", "catalogs.json",
  "manifest.webmanifest", "feedback-worker.js", "server.mjs",
  "build-precomputed-catalogs.mjs", "build-export-styles.mjs", "package.json"
];

let checks = 0;
const pass = (cond, message) => { assert.ok(cond, message); checks++; };

// 1) No committed credentials. Specific prefixes only, so ordinary hashes / the public
//    Cloudflare Web Analytics beacon token never match.
const SECRET_PATTERNS = [
  [/ghp_[A-Za-z0-9]{36}/, "GitHub token (classic)"],
  [/github_pat_[A-Za-z0-9_]{40,}/, "GitHub fine-grained token"],
  [/gh[opsu]_[A-Za-z0-9]{36}/, "GitHub OAuth/user token"],
  [/AKIA[0-9A-Z]{16}/, "AWS access key id"],
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, "private key"],
  [/\bsk-[A-Za-z0-9]{32,}\b/, "OpenAI-style secret key"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [/xox[baprs]-[0-9A-Za-z-]{10,}/, "Slack token"],
  [/\bglpat-[A-Za-z0-9_-]{20,}/, "GitLab token"]
];
for (const file of SECRET_SCAN_FILES) {
  const text = read(file);
  for (const [pattern, label] of SECRET_PATTERNS) {
    pass(!pattern.test(text), `Possible ${label} committed in ${file}`);
  }
}

// 2) index.html ships a strong Content-Security-Policy.
const html = read("index.html");
const cspMatch = html.match(/http-equiv=["']Content-Security-Policy["'][^>]*?content=(["'])([\s\S]*?)\1/i);
pass(Boolean(cspMatch), "index.html must ship a Content-Security-Policy meta tag");
const csp = cspMatch ? cspMatch[2] : "";
const directive = (name) =>
  csp.split(";").map((d) => d.trim()).find((d) => d === name || d.startsWith(name + " ")) || "";
pass(directive("default-src").includes("'self'"), "CSP must set default-src 'self'");
pass(directive("object-src") === "object-src 'none'", "CSP must set object-src 'none'");
pass(directive("base-uri").includes("'self'"), "CSP must set base-uri 'self'");
pass(directive("form-action").includes("'self'"), "CSP must set form-action 'self'");
const scriptSrc = directive("script-src");
pass(Boolean(scriptSrc), "CSP must define script-src");
pass(!scriptSrc.includes("'unsafe-inline'"), "CSP script-src must not allow 'unsafe-inline'");
pass(!scriptSrc.includes("'unsafe-eval'"), "CSP script-src must not allow 'unsafe-eval'");

// 3) No dangerous DOM sinks in browser-shipped scripts.
const DANGEROUS = [
  [/\beval\s*\(/, "eval("],
  [/\bnew\s+Function\s*\(/, "new Function("],
  [/\bdocument\.write\s*\(/, "document.write("],
  [/\.outerHTML\s*=/, ".outerHTML ="],
  [/\.insertAdjacentHTML\s*\(/, "insertAdjacentHTML("],
  [/setAttribute\(\s*["']on/i, 'setAttribute("on…")'],
  [/(?:href|src)\s*=\s*["']\s*javascript:/i, "javascript: URL literal"]
];
for (const file of BROWSER_FILES) {
  const text = read(file);
  for (const [pattern, label] of DANGEROUS) {
    pass(!pattern.test(text), `Dangerous sink ${label} found in ${file}`);
  }
}

// 4) Every target="_blank" link in index.html opts out of window.opener access.
for (const anchor of html.match(/<a\b[^>]*target=["']_blank["'][^>]*>/gi) || []) {
  pass(/rel=["'][^"']*noopener/i.test(anchor),
    `target="_blank" anchor missing rel="noopener": ${anchor.slice(0, 80)}`);
}

// 5) Research / imported source URLs are scheme-validated before becoming an href, so a
//    malicious javascript:/data: source URL can't produce an active link (this matters most
//    on the exported trip page, which has no CSP of its own).
const app = read("app.js");
pass(/function safeExternalUrl\s*\(/.test(app), "app.js must define safeExternalUrl()");
pass(/safeExternalUrl\(item\.sourceUrl\)/.test(app),
  "source-credit links must run sourceUrl through safeExternalUrl()");

// 6) Feedback stays in-app and can reach GitHub only through the same-origin Worker.
const beta = read("beta-tools.js");
pass(/var FEEDBACK_ENDPOINT\s*=\s*["']\/api\/feedback["']/.test(beta),
  "feedback client must submit to the same-origin /api/feedback route");
pass(!/github\.com/i.test(beta),
  "browser feedback code must not contain a GitHub redirect or fallback");
pass(!/window\.open\s*\(/.test(beta),
  "browser feedback code must not open an external submission window");
pass(!/feedbackEmail|["']email["']\s*:/.test(beta),
  "feedback payload must not collect or submit contact email");
pass(/feedbackWebsite/.test(beta),
  "feedback payload must include the anti-bot honeypot field");

const feedbackControls = html.match(/<(?:a|button)\b[^>]*data-open-feedback[^>]*>/gi) || [];
pass(feedbackControls.length >= 3, "Every public feedback entry point must remain present");
for (const control of feedbackControls) {
  pass(/data-open-feedback/i.test(control),
    `feedback entry point must open the in-app form: ${control.slice(0, 100)}`);
  if (/^<a\b/i.test(control)) {
    pass(/href=["']#feedback["']/i.test(control),
      `feedback links must target the in-app form: ${control.slice(0, 100)}`);
  }
  pass(!/github\.com|target=["']_blank/i.test(control),
    `feedback entry point must not navigate away: ${control.slice(0, 100)}`);
}
pass(/id=["']feedbackWebsite["']/.test(html),
  "feedback dialog must include the honeypot field");
pass(!/id=["']feedbackEmail["']/.test(html),
  "feedback dialog must not expose an email field on the public issue form");
pass(/Public tracker:/i.test(html),
  "feedback dialog must disclose that submissions become public");

const feedbackWorker = read("feedback-worker.js");
pass(/const API_PATH\s*=\s*["']\/api\/feedback["']/.test(feedbackWorker),
  "feedback Worker must intercept only /api/feedback");
pass(/christopher-013\/Adtona/.test(feedbackWorker),
  "feedback Worker must target the Adtona repository");
pass(/env\.GITHUB_TOKEN/.test(feedbackWorker),
  "feedback Worker must read the GitHub token only from its secret binding");
pass(/env\.FEEDBACK_RATE_LIMITER\.limit/.test(feedbackWorker),
  "feedback Worker must enforce its Cloudflare rate-limiting binding");
pass(!/labels:\s*\[[^\]]*["'](?:feedback|beta)["']/i.test(feedbackWorker),
  "feedback Worker must not request repository labels that do not exist");
pass(!/payload\.email|Contact \(optional\)/.test(feedbackWorker),
  "feedback Worker must not publish contact information");

console.log(`Security smoke test passed (${checks} checks).`);

// Links built from third-party catalog data (Google Maps searches, Wikipedia/Wikivoyage/
// OpenStreetMap source URLs) are not editorial endorsements, so they carry nofollow as
// Google advises for untrusted external destinations — and so a spam URL arriving in a
// data source can never pass authority from this site.
{
  const appSource = readFileSync("app.js", "utf8");
  const externalLinks = appSource.match(/rel="[^"]*noopener noreferrer"/g) || [];
  pass(externalLinks.length > 0, "Generated external links must set rel");
  pass(
    externalLinks.every((rel) => rel.includes("nofollow")),
    "Every generated external link must be nofollow, noopener and noreferrer"
  );
}

// Usage counting must never become visitor tracking. These pin the guarantees the Privacy
// dialog makes: one fixed word leaves the browser, nothing about the trip goes with it, the
// endpoint is origin-locked and rate-limited, and the client address is a limiter key only.
{
  const worker = readFileSync("feedback-worker.js", "utf8");
  const client = readFileSync("app.js", "utf8");
  const pingBody = client.slice(client.indexOf("function recordTripCompletion"));

  pass(/const PING_EVENTS = new Set\(\["trip"\]\)/.test(worker), "The counter must accept exactly one event name");
  pass(/BOT_AGENT_PATTERN/.test(worker), "Self-identifying automation must be filtered out");
  pass(/limiter\.limit\(\{ key: `ping:\$\{client\}` \}\)/.test(worker), "Pings must be rate limited under their own key");
  pass(!/counts\.put\([^)]*CF-Connecting-IP/.test(worker), "The client address must never be written to storage");
  pass(/count:\$\{day\}:\$\{event\}/.test(worker), "Only a date and an event may key the count");

  // The request body is a literal: no destination, dates, answers or identifier.
  pass(/JSON\.stringify\(\{ event: "trip" \}\)/.test(pingBody), "The ping body must carry nothing but the event name");
  // The destination is read only to build a local dedupe key; scope this to the request
  // itself so it tests what actually leaves the browser.
  const pingRequest = pingBody.slice(pingBody.indexOf("fetch(\"/api/ping\""), pingBody.indexOf("keepalive"));
  pass(!/destination|preferences|selections|trip./.test(pingRequest), "Trip content must never be sent with the ping");
  pass(/navigator\.webdriver/.test(pingBody), "Automated browser sessions must not be counted");
  pass(/TRIP_PING_KEY/.test(pingBody), "A completed trip must only be counted once");

  // Disclosed to travelers, not just implemented.
  const page = readFileSync("index.html", "utf8");
  pass(/<h3>Usage counting<\/h3>/.test(page), "Privacy must disclose the usage count");
}

// The daily digest is the history you read down the issue; the body only shows the live
// total. It must publish a date and a count and nothing else, and never file a day twice.
{
  const worker = readFileSync("feedback-worker.js", "utf8");
  const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
  pass(/async scheduled\(event, env, ctx\)/.test(worker), "A cron entry point must exist for the daily digest");
  pass(Array.isArray(config.triggers?.crons) && config.triggers.crons.length > 0, "The digest cron must be configured");
  pass(/DIGEST_POSTED_KEY/.test(worker), "A day must never be filed twice");
  pass(/if \(day < 1\)/.test(worker), "Days with no trips must be skipped");
  const digest = worker.slice(worker.indexOf("async function postDailyDigest"));
  pass(!/destination|preferences|CF-Connecting-IP/.test(digest.slice(0, digest.indexOf("catch"))), "The digest must publish nothing but a date and counts");
}
