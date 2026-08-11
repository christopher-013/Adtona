/*
 * submit-indexnow.mjs — tell search engines a new version is live.
 *
 * IndexNow is a shared protocol: one ping reaches Bing, Yandex, Seznam and Naver. Ownership
 * is proven by hosting a key file at the site root, so the key is public by design and lives
 * in this repo alongside the script that uses it.
 *
 * The Bing URL Submission API is different: its key is a real credential from Bing Webmaster
 * Tools and must never be committed. It is read from BING_WEBMASTER_API_KEY and simply
 * skipped when unset, so the deploy works without it.
 *
 * Never fails a deploy: search-engine pings are best effort, and a submission endpoint being
 * slow or rate limited is not a reason to hold back a release.
 */
import { readdir } from "node:fs/promises";

const HOST = process.env.INDEXNOW_HOST || "adtona.com";
const URLS = [`https://${HOST}/`, `https://${HOST}/about`, `https://${HOST}/privacy`];
const TIMEOUT_MS = 15000;

async function postJson(url, body, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, status: 0, error: error?.message || String(error) };
  } finally {
    clearTimeout(timer);
  }
}

// The key file's name is the key, so the repo is the single source of truth for both.
async function readIndexNowKey() {
  const entries = await readdir(new URL(".", import.meta.url));
  const keyFile = entries.find((name) => /^[0-9a-f]{16,128}\.txt$/i.test(name));
  return keyFile ? keyFile.replace(/\.txt$/i, "") : "";
}

const key = await readIndexNowKey();
if (!key) {
  console.warn("No IndexNow key file found; skipping IndexNow submission.");
} else {
  const result = await postJson("https://api.indexnow.org/IndexNow", {
    host: HOST,
    key,
    keyLocation: `https://${HOST}/${key}.txt`,
    urlList: URLS
  });
  console.log(result.ok
    ? `IndexNow accepted ${URLS.length} URL(s) (HTTP ${result.status}).`
    : `IndexNow submission skipped (HTTP ${result.status}${result.error ? `: ${result.error}` : ""}).`);
}

const bingKey = process.env.BING_WEBMASTER_API_KEY;
if (!bingKey) {
  console.log("BING_WEBMASTER_API_KEY not set; skipping the Bing URL Submission API.");
} else {
  const result = await postJson(
    `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=${encodeURIComponent(bingKey)}`,
    { siteUrl: `https://${HOST}`, urlList: URLS }
  );
  console.log(result.ok
    ? `Bing URL Submission accepted ${URLS.length} URL(s).`
    : `Bing URL Submission skipped (HTTP ${result.status}${result.error ? `: ${result.error}` : ""}).`);
}
