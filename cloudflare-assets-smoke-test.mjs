import assert from "node:assert/strict";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.join(projectRoot, "dist");
const maxAssetBytes = 25 * 1024 * 1024;

const requiredFiles = [
  "index.html",
  "robots.txt",
  "version.js",
  "catalogs.json",
  "dynamic-catalog.js",
  "app.js",
  "styles.css",
  "export-styles.js",
  "icon-source.js",
  "photo-store.js",
  "trip-schema.js",
  "beta-tools.js",
  "adtona-logo.png",
  "adtona-mark.png",
  "manifest.webmanifest",
  "sw.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/favicon-16.png",
  "icons/favicon-32.png",
  "icons/apple-touch-icon.png",
  "icons/maskable-192.png",
  "icons/maskable-512.png",
  "icons/adtona-social-1200x630.png"
];

const forbiddenSegments = new Set([
  "node_modules",
  ".git",
  ".github",
  ".claude",
  ".agents",
  ".wrangler",
  "versions",
  "verification-export",
  "test-fixtures",
  "public"
]);

const wrangler = JSON.parse(await readFile(path.join(projectRoot, "wrangler.jsonc"), "utf8"));
assert.equal(wrangler.main, "./feedback-worker.js", "Wrangler must run the integrated feedback Worker");
assert.equal(wrangler.assets?.directory, "./dist", "Wrangler must publish only ./dist");
assert.equal(wrangler.assets?.binding, "ASSETS", "Static files must be available through the ASSETS binding");
assert(
  Array.isArray(wrangler.assets?.run_worker_first)
    && wrangler.assets.run_worker_first.includes("/api/feedback"),
  "Wrangler must route /api/feedback through the Worker before static assets"
);
assert.equal(
  wrangler.vars?.GITHUB_REPO,
  "christopher-013/Adtona",
  "Feedback must target the Adtona repository"
);
// GITHUB_TOKEN is an encrypted Cloudflare secret set out-of-band (dashboard / `wrangler secret
// put GITHUB_TOKEN`) and persists across deploys. It must NOT be declared as a deploy-time
// required secret in wrangler.jsonc — doing so makes `wrangler deploy` hard-fail in CI before
// the value can be read from the Worker's secret store. The Worker still requires it at runtime
// (returns 500 without it), which is enforced by feedback-worker-smoke-test.mjs.
assert(!wrangler.secrets, "wrangler.jsonc must not declare deploy-time required secrets; GITHUB_TOKEN is set in Cloudflare's secret store");
const feedbackWorkerSource = await readFile(path.join(projectRoot, "feedback-worker.js"), "utf8");
assert(/env\.GITHUB_TOKEN/.test(feedbackWorkerSource), "Feedback Worker must read the GitHub token from its secret binding at runtime");
const feedbackRateLimiter = (wrangler.ratelimits || [])
  .find((binding) => binding.name === "FEEDBACK_RATE_LIMITER");
assert(feedbackRateLimiter, "Feedback Worker must declare a Cloudflare rate-limiting binding");
assert.equal(feedbackRateLimiter.simple?.limit, 5, "Feedback rate limit must allow five submissions");
assert.equal(feedbackRateLimiter.simple?.period, 60, "Feedback rate-limit period must be one minute");
for (const origin of [
  "https://adtona.com",
  "https://www.adtona.com",
  "https://adtona.cch13.workers.dev",
  "http://127.0.0.1:8767",
  "http://localhost:8767"
]) {
  assert(
    String(wrangler.vars?.ALLOWED_ORIGINS || "").split(",").includes(origin),
    `Missing feedback origin in Wrangler configuration: ${origin}`
  );
}
assert.notEqual(path.resolve(projectRoot, wrangler.assets.directory), projectRoot, "Wrangler must never publish the repository root");

async function collectFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);
    const metadata = await lstat(absolutePath);
    assert.equal(metadata.isSymbolicLink(), false, `Deployment assets must not contain symlinks: ${relativePath}`);
    if (entry.isDirectory()) files.push(...await collectFiles(absolutePath, relativePath));
    else if (entry.isFile()) files.push({ relativePath, absolutePath, size: metadata.size });
  }
  return files;
}

const files = await collectFiles(outputDirectory);
const deployedPaths = new Set(files.map((file) => file.relativePath));
assert(!deployedPaths.has("feedback-worker.js"), "Worker source must not be copied into public static assets");

for (const relativePath of requiredFiles) {
  assert(deployedPaths.has(relativePath), `Missing required Cloudflare asset: ${relativePath}`);
}

for (const file of files) {
  const segments = file.relativePath.split("/");
  assert(!segments.some((segment) => forbiddenSegments.has(segment)), `Forbidden deployment path: ${file.relativePath}`);
  assert(file.size <= maxAssetBytes, `Cloudflare asset exceeds 25 MiB: ${file.relativePath} (${file.size} bytes)`);
  assert(!/(?:smoke-test|build-cloudflare|server|feedback-worker)\.(?:m?js)$/i.test(file.relativePath), `Development-only code leaked into deployment: ${file.relativePath}`);
  if (/\.(?:html|js|json|md|txt|webmanifest)$/i.test(file.relativePath)) {
    const contents = await readFile(file.absolutePath, "utf8");
    assert(!/github_pat_[A-Za-z0-9_]{40,}|ghp_[A-Za-z0-9]{36}/.test(contents),
      `Possible GitHub credential leaked into deployment: ${file.relativePath}`);
  }
}

function localReference(value) {
  const reference = String(value || "").trim();
  if (!reference || /^(?:https?:|data:|blob:|mailto:|tel:|#)/i.test(reference)) return "";
  return reference.split(/[?#]/, 1)[0].replace(/^\.?\//, "");
}

const html = await readFile(path.join(outputDirectory, "index.html"), "utf8");
const htmlReferences = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)]
  .map((match) => localReference(match[1]))
  .filter(Boolean);
for (const reference of htmlReferences) {
  // Cloudflare's asset handler serves an extensionless path from its .html file (and
  // redirects the .html form to it), so /privacy is backed by privacy.html. Accept either
  // spelling rather than forcing links to point at the URL that only 307s.
  const deployed = deployedPaths.has(reference) || deployedPaths.has(`${reference}.html`);
  assert(deployed, `index.html references a missing deployment asset: ${reference}`);
}

const manifest = JSON.parse(await readFile(path.join(outputDirectory, "manifest.webmanifest"), "utf8"));
for (const icon of manifest.icons || []) {
  const reference = localReference(icon.src);
  assert(reference && deployedPaths.has(reference), `Manifest references a missing icon: ${icon.src}`);
}

const serviceWorker = await readFile(path.join(outputDirectory, "sw.js"), "utf8");
const precacheMatch = serviceWorker.match(/const PRECACHE_URLS\s*=\s*(\[[\s\S]*?\]);/);
assert(precacheMatch, "Could not read service-worker precache list");
const precacheUrls = JSON.parse(precacheMatch[1]);
for (const value of precacheUrls) {
  const reference = localReference(value);
  if (!reference) continue;
  assert(deployedPaths.has(reference), `Service worker precaches a missing deployment asset: ${value}`);
}

const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
const largest = [...files].sort((a, b) => b.size - a.size).slice(0, 5);
console.log(`Cloudflare asset smoke test passed: ${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB total.`);
console.log(`Largest assets: ${largest.map((file) => `${file.relativePath} ${(file.size / 1024 / 1024).toFixed(2)} MiB`).join(", ")}`);
