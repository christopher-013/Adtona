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

const feedbackAnchors = html.match(/<a\b[^>]*(?:feedback-link|feedback-header-link)[^>]*>/gi) || [];
pass(feedbackAnchors.length >= 3, "Every public feedback entry point must remain present");
for (const anchor of feedbackAnchors) {
  pass(/href=["']#feedback["']/i.test(anchor),
    `feedback entry point must open the in-app form: ${anchor.slice(0, 100)}`);
  pass(!/github\.com|target=["']_blank/i.test(anchor),
    `feedback entry point must not navigate away: ${anchor.slice(0, 100)}`);
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
