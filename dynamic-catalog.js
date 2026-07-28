(function (global) {
  "use strict";

  // Timeouts are generous enough to survive a slow mobile/cellular connection: on a fast
  // desktop the requests still return quickly, but a phone on a weak signal now gets time to
  // finish instead of aborting and falling back to generic filler cards.
  const FETCH_TIMEOUT_MS = 9000;
  const OVERPASS_TIMEOUT_MS = 13000;
  const PIPELINE_TIMEOUT_MS = 16000;
  const MAX_CONCURRENT_REQUESTS = 6;
  const MAX_REQUEST_ATTEMPTS = 3;
  // 429 is deliberately NOT retryable: retrying pours more requests into an already-tripped
  // rate-limit window. A 429 opens the Wikimedia circuit breaker below instead.
  const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
  const WIKIMEDIA_HOST_PATTERN = /(^|\.)wikipedia\.org$|(^|\.)wikivoyage\.org$/i;
  const WIKIMEDIA_API_USER_AGENT = "Adtona/5.0 (https://christopher-013.github.io/PlanToGuide/)";
  const RATE_LIMIT_DEFAULT_MS = 60000;
  const RATE_LIMIT_MAX_MS = 5 * 60000;
  const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const CACHE_LIMIT_BYTES = 200000;
  const WIKIVOYAGE_API = "https://en.wikivoyage.org/w/api.php";
  const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
  const OPEN_METEO_GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";
  const OVERPASS_API = "https://overpass-api.de/api/interpreter";
  const NEUTRAL_BANNER_PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="800" viewBox="0 0 1800 800"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#244f66"/><stop offset="1" stop-color="#79a6ad"/></linearGradient></defs><rect width="1800" height="800" fill="url(#g)"/></svg>')}`;

  let activeRequestCount = 0;
  const requestQueue = [];
  const inFlightJsonRequests = new Map();

  // Wikimedia circuit breaker: after any 429, all Wikimedia requests fail fast until the
  // Retry-After window passes, instead of burning more of the rate-limit budget.
  let wikimediaBlockedUntil = 0;
  let rateLimitEpoch = 0;
  let lastResearchOutcome = null;

  function isWikimediaUrl(url) {
    try { return WIKIMEDIA_HOST_PATTERN.test(new URL(url).hostname); } catch (_) { return false; }
  }

  function noteWikimediaRateLimit(retryAfterSeconds) {
    const waitMs = Math.min(RATE_LIMIT_MAX_MS, Math.max(RATE_LIMIT_DEFAULT_MS, (Number(retryAfterSeconds) || 0) * 1000));
    wikimediaBlockedUntil = Math.max(wikimediaBlockedUntil, Date.now() + waitMs);
    rateLimitEpoch += 1;
  }

  function isWikimediaThrottled() {
    return Date.now() < wikimediaBlockedUntil;
  }

  function wikimediaRetryAfterMs() {
    return Math.max(0, wikimediaBlockedUntil - Date.now());
  }

  function getLastResearchOutcome() {
    return lastResearchOutcome ? { ...lastResearchOutcome } : null;
  }

  function rateLimitError() {
    const error = new Error("Wikimedia requests are rate limited");
    error.status = 429;
    error.rateLimited = true;
    return error;
  }

  function drainRequestQueue() {
    while (activeRequestCount < MAX_CONCURRENT_REQUESTS && requestQueue.length) {
      const entry = requestQueue.shift();
      if (entry.signal?.aborted) {
        entry.reject(abortError());
        continue;
      }
      activeRequestCount += 1;
      Promise.resolve().then(entry.task).then(entry.resolve, entry.reject).finally(() => {
        activeRequestCount -= 1;
        drainRequestQueue();
      });
    }
  }

  function withRequestLimit(task, signal) {
    return new Promise((resolve, reject) => {
      requestQueue.push({ task, signal, resolve, reject });
      drainRequestQueue();
    });
  }

  function abortError() {
    try { return new DOMException("The request was aborted.", "AbortError"); }
    catch (_) { const error = new Error("The request was aborted."); error.name = "AbortError"; return error; }
  }

  function coordinate(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function waitFor(ms, signal) {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(abortError());
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener?.("abort", abort);
        resolve();
      }, ms);
      signal?.addEventListener?.("abort", abort, { once: true });
    });
  }

  function slugify(value = "") {
    return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "destination";
  }

  function escapeRegExp(value = "") {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function safeStorageGet(key) {
    try { return global.localStorage?.getItem(key) || ""; } catch (_) { return ""; }
  }

  function safeStorageSet(key, value) {
    try { global.localStorage?.setItem(key, value); return true; } catch (_) { return false; }
  }

  function cacheKey(slug) {
    return `ptg:dyncat4:${slug}:${global.PLANTOGUIDE_VERSION || "dev"}`;
  }

  const dynamicCatalogCache = {
    get(slug) {
      try {
        const raw = safeStorageGet(cacheKey(slug));
        if (!raw) return null;
        const payload = JSON.parse(raw);
        if (!payload || Date.now() - Number(payload.cachedAt || 0) > CACHE_TTL_MS) return null;
        return payload.catalog || null;
      } catch (_) {
        return null;
      }
    },
    set(slug, catalog) {
      try {
        const value = JSON.stringify({ cachedAt: Date.now(), catalog });
        if (value.length > CACHE_LIMIT_BYTES) return false;
        return safeStorageSet(cacheKey(slug), value);
      } catch (_) {
        return false;
      }
    }
  };

  function makeUrl(base, params) {
    const url = new URL(base);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.toString();
  }

  async function performJsonRequest(url, signal, timeoutMs) {
    const wikimedia = isWikimediaUrl(url);
    // Wikimedia asks API clients to identify themselves; browsers cannot set User-Agent but
    // honor Api-User-Agent as the documented substitute. Anonymous no-agent traffic gets the
    // strictest rate-limit bucket.
    const requestInit = wikimedia ? { headers: { "Api-User-Agent": WIKIMEDIA_API_USER_AGENT } } : {};
    let lastError;
    for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt += 1) {
      if (wikimedia && isWikimediaThrottled()) throw rateLimitError();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const abort = () => controller.abort();
      signal?.addEventListener?.("abort", abort, { once: true });
      try {
        const response = await fetch(url, { ...requestInit, signal: controller.signal });
        if (response.ok) return await response.json();
        if (response.status === 429 && wikimedia) {
          noteWikimediaRateLimit(Number(response.headers?.get?.("retry-after") || 0));
          throw rateLimitError();
        }
        const error = new Error(`Request failed: ${response.status}`);
        error.status = response.status;
        error.retryAfter = Number(response.headers?.get?.("retry-after") || 0);
        throw error;
      } catch (error) {
        lastError = error;
        if (signal?.aborted || error?.name === "AbortError" || error?.rateLimited || !RETRYABLE_STATUS.has(Number(error?.status)) || attempt === MAX_REQUEST_ATTEMPTS - 1) throw error;
        const retryDelay = error.retryAfter > 0 ? Math.min(error.retryAfter * 1000, 3000) : 250 * (2 ** attempt);
        await waitFor(retryDelay, signal);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener?.("abort", abort);
      }
    }
    throw lastError || new Error("Request failed");
  }

  function fetchJson(url, signal, timeoutMs = FETCH_TIMEOUT_MS) {
    if (signal?.aborted) return Promise.reject(abortError());
    const key = `${timeoutMs}:${url}`;
    let shared = inFlightJsonRequests.get(key);
    if (!shared) {
      shared = withRequestLimit(() => performJsonRequest(url, signal, timeoutMs), signal)
        .finally(() => inFlightJsonRequests.delete(key));
      inFlightJsonRequests.set(key, shared);
    }
    if (!signal?.addEventListener) return shared;
    return new Promise((resolve, reject) => {
      const abort = () => reject(abortError());
      signal.addEventListener("abort", abort, { once: true });
      shared.then((value) => {
        signal.removeEventListener?.("abort", abort);
        resolve(value);
      }, (error) => {
        signal.removeEventListener?.("abort", abort);
        reject(error);
      });
    });
  }

  async function fetchOverpass(query, signal) {
    const url = makeUrl(OVERPASS_API, { data: query });
    // Dense metro areas routinely need more than the default fetch budget; the pipeline cap (12s)
    // still bounds the total wait, and the other sources run in parallel.
    return fetchJson(url, signal, OVERPASS_TIMEOUT_MS);
  }

  function scoreGeocodeResult(result, query) {
    const normalizedQuery = slugify(query).replace(/-/g, " ");
    const hint = query.includes(",") ? query.split(",").slice(1).join(" ").toLowerCase() : "";
    const fields = [result.name, result.admin1, result.country, result.country_code].filter(Boolean).join(" ").toLowerCase();
    let score = Math.log10(Number(result.population || 1));
    if (fields.includes(normalizedQuery)) score += 8;
    if (hint && fields.includes(hint.trim())) score += 5;
    if (String(result.name || "").toLowerCase() === query.split(",")[0].trim().toLowerCase()) score += 4;
    return score;
  }

  async function geocodeDestination(query, options = {}) {
    const name = String(query || "").trim();
    if (!name) return null;
    const url = makeUrl(OPEN_METEO_GEOCODE, { name, count: "5", language: "en", format: "json" });
    const data = await fetchJson(url, options.signal);
    const results = Array.isArray(data?.results) ? data.results : [];
    if (!results.length) return null;
    return results.sort((a, b) => scoreGeocodeResult(b, name) - scoreGeocodeResult(a, name))[0];
  }

  function splitTopLevel(text, separator = "|") {
    const parts = [];
    let current = "";
    let templateDepth = 0;
    let linkDepth = 0;
    for (let index = 0; index < text.length; index += 1) {
      const pair = text.slice(index, index + 2);
      if (pair === "{{") { templateDepth += 1; current += pair; index += 1; continue; }
      if (pair === "}}") { templateDepth = Math.max(0, templateDepth - 1); current += pair; index += 1; continue; }
      if (pair === "[[") { linkDepth += 1; current += pair; index += 1; continue; }
      if (pair === "]]") { linkDepth = Math.max(0, linkDepth - 1); current += pair; index += 1; continue; }
      if (text[index] === separator && !templateDepth && !linkDepth) {
        parts.push(current);
        current = "";
      } else current += text[index];
    }
    parts.push(current);
    return parts;
  }

  function extractTemplates(wikitext = "") {
    const templates = [];
    for (let index = 0; index < wikitext.length - 1; index += 1) {
      if (wikitext.slice(index, index + 2) !== "{{") continue;
      const start = index;
      let depth = 1;
      index += 2;
      for (; index < wikitext.length - 1; index += 1) {
        const pair = wikitext.slice(index, index + 2);
        if (pair === "{{") { depth += 1; index += 1; continue; }
        if (pair === "}}") {
          depth -= 1;
          if (!depth) {
            templates.push(wikitext.slice(start + 2, index));
            index += 1;
            break;
          }
          index += 1;
        }
      }
    }
    return templates;
  }

  function stripWikitext(value = "") {
    let text = String(value);
    text = text.replace(/<ref[\s\S]*?<\/ref>/gi, " ").replace(/<ref[^>]*\/>/gi, " ");
    let previous = "";
    while (previous !== text) {
      previous = text;
      text = text.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => {
        const parts = splitTopLevel(inner).map((part) => part.trim()).filter(Boolean);
        if (parts.length <= 1) return " ";
        return parts[parts.length - 1];
      });
    }
    text = text.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1");
    text = text.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, "$1").replace(/\[https?:\/\/[^\]]+\]/g, " ");
    text = text.replace(/'''?/g, "").replace(/<[^>]+>/g, " ");
    text = text.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");
    return text.replace(/\s+/g, " ").trim();
  }

  // A Wikivoyage listing's `image=` is a Commons filename. Special:FilePath resolves it to a
  // real thumbnail with NO extra API call (the browser follows the redirect), so these places
  // get a real photo for free instead of a per-card image lookup. Skip diagrams/maps/SVGs.
  function commonsImageUrl(rawName, width = 640) {
    const name = String(rawName || "").replace(/^\s*(?:file|image|bild)\s*:\s*/i, "").trim();
    if (!name || /^(none|various|no|n\/a)$/i.test(name)) return "";
    if (!/\.(jpe?g|png|webp)$/i.test(name)) return "";
    if (/\b(map|diagram|locator|logo|flag|coat[_ ]of[_ ]arms|plan)\b/i.test(name)) return "";
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name.replace(/\s+/g, "_"))}?width=${width}`;
  }

  // Reject tiny transparent shims and common non-photographic page images. Wikipedia pages
  // occasionally expose Blank.png, a seal, or a locator map as their "thumbnail"; treating that
  // as a place photo produces misleading cards and can also poison the destination banner.
  function usablePlaceImage(value = "") {
    const image = String(value || "").trim();
    if (!image) return "";
    let decoded = image;
    try { decoded = decodeURIComponent(image); } catch (_) { /* keep the original URL */ }
    if (/\b(?:blank|transparent|spacer|pixel)\.(?:gif|png|jpe?g|webp)\b/i.test(decoded)) return "";
    if (/\b(?:locator|location[_ -]?map|route[_ -]?map|coat[_ -]?of[_ -]?arms|logo|flag|seal|icon)\b/i.test(decoded)) return "";
    if (/\.svg(?:[?#]|$)/i.test(decoded)) return "";
    return image;
  }

  function wikipediaThumbnail(page = {}) {
    const thumbnail = page.thumbnail || {};
    const width = Number(thumbnail.width || 0);
    const height = Number(thumbnail.height || 0);
    if ((width && width < 160) || (height && height < 100)) return "";
    return usablePlaceImage(thumbnail.source);
  }

  // Pure nightlife: dancing, DJs and live music venues rather than somewhere to eat. Bare
  // "club" is included because venues like "Cafe de Jumpin'" carry a food-sounding name and
  // only the description reveals what they are.
  const NIGHTLIFE_PATTERN = /\b(night\s?club|nightclub|dance\s?floors?|dancefloor|discoth[eè]que|\bdisco\b|\bdjs?\b|clubbing|\bclub\b|karaoke|cabaret|strip\s?club|hostess\s?(?:bar|club)|live\s?house|rave|after[\s-]?party|gay\s?bar|dive\s?bar|cocktail\s?lounge)\b/i;

  function isNightlifeListing(name = "", description = "") {
    return NIGHTLIFE_PATTERN.test(`${name} ${description}`);
  }

  function parseListingTemplate(content, pageTitle) {
    const parts = splitTopLevel(content);
    const templateName = parts.shift().trim().toLowerCase();
    const allowed = new Set(["see", "do", "eat", "drink", "buy", "listing", "sleep"]);
    if (!allowed.has(templateName)) return null;
    const fields = {};
    const unnamed = [];
    parts.forEach((part) => {
      const equalIndex = part.indexOf("=");
      if (equalIndex > -1) fields[part.slice(0, equalIndex).trim().toLowerCase()] = part.slice(equalIndex + 1).trim();
      else if (part.trim()) unnamed.push(part.trim());
    });
    const rawName = fields.name || fields.alt || fields.content || unnamed[0] || "";
    const name = stripWikitext(rawName);
    if (!name || /^(none|various)$/i.test(name)) return null;
    const description = stripWikitext(fields.content || fields.description || fields.directions || fields.wiki || unnamed.slice(1).join(" "));
    const category = templateName === "listing" ? String(fields.type || "").toLowerCase() : templateName;
    // Wikivoyage's {{drink}} template covers bars, pubs and nightclubs — not restaurants.
    // Mapping it wholesale onto "eat" listed nightlife under "Places to eat" (a dance club
    // described as having three dance floors, for example). Keep only the food-serving
    // drink listings; drop pure nightlife, which fits none of the see/eat/buy categories.
    // {{drink}} is Wikivoyage's bar/pub/nightclub section, so nothing from it becomes a
    // place to eat. Testing the name for food words was not enough: "Cafe de Jumpin'" is a
    // nightclub whose name merely starts with "Cafe". Places to eat come from the {{eat}}
    // section, which is also the list travellers recognise.
    const type = /drink/.test(category)
      ? ""
      : /eat/.test(category) ? "eat" : /buy/.test(category) ? "buy" : /see|do/.test(category) ? "see" : "";
    if (!type) return null;
    // Belt and braces: a listing filed under {{eat}} that reads purely as nightlife is
    // still not a place to eat.
    if (type === "eat" && isNightlifeListing(name, description)) return null;
    const sourceUrl = `https://en.wikivoyage.org/wiki/${encodeURIComponent(String(pageTitle || "").replace(/\s+/g, "_"))}`;
    return {
      name,
      type,
      area: stripWikitext(pageTitle || fields.address || fields.district || ""),
      detail: description || "A Wikivoyage-listed place to research and verify before visiting.",
      image: commonsImageUrl(fields.image),
      address: stripWikitext(fields.address || ""),
      officialUrl: stripWikitext(fields.url || fields.website || ""),
      lat: coordinate(fields.lat || fields.latitude),
      lon: coordinate(fields.long || fields.lon || fields.longitude),
      sourceLabel: "Wikivoyage",
      sourceUrl,
      sourceId: `wikivoyage:${slugify(pageTitle)}:${slugify(name)}`,
      sourceLicense: "CC BY-SA 4.0",
      sourceAttribution: "Wikivoyage contributors"
    };
  }

  function parseWikivoyageListings(wikitext = "", pageTitle = "") {
    const seen = new Set();
    const items = extractTemplates(wikitext).map((template) => parseListingTemplate(template, pageTitle)).filter((item) => {
      if (!item) return false;
      const key = slugify(item.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // Wikivoyage sections are written with the best-known places first, so a listing's
    // position within its own section is a genuine popularity signal. Record it; the
    // ranker uses it to lead with the opening entries of the Eat list rather than
    // whichever name happens to score well on keywords.
    const positions = new Map();
    items.forEach((item) => {
      const next = positions.get(item.type) || 0;
      item.wikivoyageRank = next;
      positions.set(item.type, next + 1);
    });
    return items;
  }

  function findDistrictTitles(wikitext = "", pageTitle = "") {
    // Escape first, then loosen spaces — the reverse order escaped the [ _] brackets themselves,
    // so district subpages were never detected for any multi-word city (Las Vegas, New York, ...).
    const escaped = escapeRegExp(pageTitle).replace(/ /g, "[ _]");
    const titles = new Set();
    const regex = new RegExp(`\\[\\[(${escaped}/[^|\\]#]+)`, "gi");
    let match;
    while ((match = regex.exec(wikitext))) titles.add(match[1].replace(/_/g, " ").trim());
    return [...titles].slice(0, 5);
  }

  // The search query includes the country for disambiguation, but Wikivoyage often ranks the
  // COUNTRY article above the city for such queries ("London United Kingdom" → "United
  // Kingdom"), and country pages have no dining/shopping listings or district subpages.
  // Prefer the result whose title matches the geocoded city name.
  async function wikivoyagePageTitle(destination, preferredTitle, signal) {
    const data = await fetchJson(makeUrl(WIKIVOYAGE_API, {
      action: "query", list: "search", srsearch: destination, srlimit: "5", format: "json", origin: "*"
    }), signal);
    const results = data?.query?.search || [];
    if (!results.length) return null;
    const preferred = String(preferredTitle || "").trim().toLowerCase();
    if (preferred) {
      const exact = results.find((result) => String(result.title || "").toLowerCase() === preferred);
      if (exact) return exact.title;
      const prefixed = results.find((result) => String(result.title || "").toLowerCase().startsWith(preferred));
      if (prefixed) return prefixed.title;
    }
    return results[0].title;
  }

  async function fetchWikivoyageWikitext(title, signal) {
    const data = await fetchJson(makeUrl(WIKIVOYAGE_API, {
      action: "parse", page: title, prop: "wikitext", redirects: "1", format: "json", origin: "*"
    }), signal);
    return data?.parse?.wikitext?.["*"] || "";
  }

  async function fetchWikivoyageListings(destination, preferredTitle, signal) {
    const title = await wikivoyagePageTitle(destination, preferredTitle, signal);
    if (!title) return { title: "", items: [] };
    const wikitext = await fetchWikivoyageWikitext(title, signal);
    let items = parseWikivoyageListings(wikitext, title);
    const thin = items.filter((item) => item.type === "see").length < 5
      || items.filter((item) => item.type === "eat").length < 3
      || items.filter((item) => item.type === "buy").length < 2;
    if (thin) {
      const districts = findDistrictTitles(wikitext, title);
      const districtLists = await Promise.all(districts.map(async (district) => {
        try { return parseWikivoyageListings(await fetchWikivoyageWikitext(district, signal), district); }
        catch (_) { return []; }
      }));
      items = [...items, ...districtLists.flat()];
    }
    return { title, items: dedupeItems(items) };
  }

  // Tuned to drop Wikipedia geosearch noise that isn't a visitable attraction — transit infrastructure,
  // schools/faculties, and administrative-boundary articles — while still keeping the single nearest
  // station (travelers use the main station) and legitimate "University of X" main-campus articles.
  const NON_ATTRACTION_TITLE_PATTERN = /railway station|train station|metro station|tube station|bus station|school|faculty|district of|municipality|province of|county of|\(company\)|corporation|timeline of|history of|list of|diocese|archdiocese|city hall|courthouse|court house|post office|fire (department|station|& rescue)|police|\(tv series\)|\(film\)|\(series\)|season \d|city council|school district|library district|\bauthority\b|tourism board|\bearthquake\b|\btyphoon\b|\bhurricane\b|\bfloods?\b|\bwildfires?\b|\bdisaster\b|\belection\b/i;
  const STATION_TITLE_PATTERN = /railway station|train station|metro station|tube station|bus station/i;
  const ADMINISTRATIVE_EXTRACT_PATTERN = /^(?:.{0,90}\b)?(?:is|was)\s+(?:an?\s+)?(?:\d+(?:st|nd|rd|th)[ -]class\s+)?(?:component\s+)?(?:municipality|province|administrative region|barangay|census-designated place|unincorporated community)\b/i;

  function wikipediaPageLooksVisitable(page = {}, destinationName = "") {
    const title = String(page.title || "");
    const extract = String(page.extract || "").replace(/\s+/g, " ").trim();
    if (!title) return false;
    if (destinationName && (title === destinationName || title.startsWith(`${destinationName},`))) return false;
    if (NON_ATTRACTION_TITLE_PATTERN.test(title) && !STATION_TITLE_PATTERN.test(title)) return false;
    if (ADMINISTRATIVE_EXTRACT_PATTERN.test(extract)) return false;
    return true;
  }

  async function fetchWikipediaGeoPlaces(geocode, signal) {
    if (!geocode?.latitude || !geocode?.longitude) return [];
    const geo = await fetchJson(makeUrl(WIKIPEDIA_API, {
      action: "query", list: "geosearch", gscoord: `${geocode.latitude}|${geocode.longitude}`, gsradius: "10000",
      gslimit: "50", format: "json", origin: "*"
    }), signal);
    const ids = (geo?.query?.geosearch || []).map((item) => item.pageid).filter(Boolean).slice(0, 50);
    if (!ids.length) return [];
    const pages = await fetchJson(makeUrl(WIKIPEDIA_API, {
      action: "query", pageids: ids.join("|"), prop: "pageviews|pageimages|extracts|info", exintro: "1", explaintext: "1",
      piprop: "thumbnail", pithumbsize: "640", inprop: "url", format: "json", origin: "*"
    }), signal);
    const pageMap = pages?.query?.pages || {};
    const geoMap = new Map((geo?.query?.geosearch || []).map((item) => [Number(item.pageid), item]));
    const orderedPages = ids.map((id) => pageMap[id]).filter(Boolean);
    const destinationName = geocode.name || "";
    let keptAStation = false;
    return orderedPages.filter((page) => {
      const title = String(page.title || "");
      if (!wikipediaPageLooksVisitable(page, destinationName)) return false;
      if (NON_ATTRACTION_TITLE_PATTERN.test(title)) {
        if (STATION_TITLE_PATTERN.test(title) && !keptAStation) {
          keptAStation = true;
          return true;
        }
        return false;
      }
      return true;
    }).map((page) => ({
      name: page.title,
      type: "see",
      area: geocode.name,
      detail: String(page.extract || "A Wikipedia-listed landmark or neighborhood worth researching.").split(/\n/)[0].slice(0, 220),
      image: wikipediaThumbnail(page),
      lat: coordinate(geoMap.get(Number(page.pageid))?.lat),
      lon: coordinate(geoMap.get(Number(page.pageid))?.lon),
      popularity: averageDailyPageviews(page),
      sourceLabel: "Wikipedia",
      sourceUrl: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(String(page.title || "").replace(/\s+/g, "_"))}`,
      sourceId: `wikipedia:${page.pageid || slugify(page.title)}`,
      sourceLicense: "CC BY-SA 4.0",
      sourceAttribution: "Wikipedia contributors"
    }));
  }

  // Average daily Wikipedia pageviews (~60-day window from prop=pageviews). This is the
  // notability signal that keeps world-famous sights above obscure keyword-heavy articles
  // (St Paul's Cathedral ~1,300 views/day vs a suburban park's ~10).
  function averageDailyPageviews(page) {
    const days = Object.values(page?.pageviews || {}).filter((views) => Number.isFinite(views));
    if (!days.length) return 0;
    return Math.round(days.reduce((sum, views) => sum + views, 0) / days.length);
  }

  // Topics used to discover the destination's real category names. Many metro areas file their
  // headline attractions under regional categories ("Tourist attractions in the Las Vegas Valley",
  // not "... in Las Vegas"), so a fixed "in {city}" list misses them entirely.
  const CATEGORY_TOPICS = ["Tourist attractions", "Landmarks", "Museums", "Parks", "Beaches", "Shopping malls", "Casinos", "Amusement parks", "Restaurants", "Coffeehouses", "Bakeries"];
  // Categories whose members are places to eat. Restaurant articles rarely have a food word
  // in the title ("Canlis"), so the category they came from is what identifies them.
  const FOOD_CATEGORY_PATTERN = /\b(restaurant|coffee ?house|caf[eé]|bakery|bakeries|diner|steakhouse|pizzeria|brewer|food hall)/i;
  // Same idea for shopping: "Westlake Center" is a mall, but nothing in its title says so.
  const SHOP_CATEGORY_PATTERN = /\b(shopping (?:mall|centre|center|district)|malls|market|bazaar|department store)/i;
  const CATEGORY_TITLE_EXCLUDE = /defunct|former|proposed|demolished|planned|unbuilt|people|history of|companies|images|borough of/i;

  function filterDiscoveredCategoryTitles(results, city) {
    const perTopic = new Map();
    (results || []).forEach((result) => {
      const title = String(result.title || "").replace(/^Category:/, "");
      const lower = title.toLowerCase();
      const topic = CATEGORY_TOPICS.find((candidate) => lower.startsWith(candidate.toLowerCase()));
      if (!topic || !lower.includes(city.toLowerCase()) || CATEGORY_TITLE_EXCLUDE.test(title)) return;
      const bucket = perTopic.get(topic) || [];
      if (bucket.length < 2) { bucket.push(title); perTopic.set(topic, bucket); }
    });
    return [...perTopic.values()].flat();
  }

  // Two searches instead of one per topic: the headline "Tourist attractions" query plus one
  // combined query whose OR terms surface the remaining topic categories. Keeps the request
  // budget small while still finding metro-area category names like "... the Las Vegas Valley".
  async function discoverCategoryTitles(city, signal) {
    const queries = [
      `intitle:"Tourist attractions" intitle:"${city}"`,
      `intitle:"${city}" (museums OR casinos OR malls OR parks OR beaches OR landmarks OR amusement)`
    ];
    const searches = await Promise.all(queries.map(async (srsearch) => {
      try {
        const data = await fetchJson(makeUrl(WIKIPEDIA_API, {
          action: "query", list: "search", srnamespace: "14", srlimit: "20",
          srsearch, format: "json", origin: "*"
        }), signal);
        return data?.query?.search || [];
      } catch (_) {
        return [];
      }
    }));
    return filterDiscoveredCategoryTitles(searches.flat(), city);
  }

  async function fetchWikipediaCategoryPlaces(destination, geocode, signal) {
    const city = geocode?.name || destination;
    const staticNames = [
      `Tourist attractions in ${city}`,
      `Museums in ${city}`,
      `Parks in ${city}`,
      `Shopping malls in ${city}`,
      // Dining fallback: when Wikivoyage and OpenStreetMap return few real places to eat,
      // these categories still yield named, notable restaurants and coffee houses rather
      // than leaving the deck to generic "neighbourhood cafe" filler.
      `Restaurants in ${city}`,
      `Coffeehouses in ${city}`
    ];
    const discovered = await discoverCategoryTitles(city, signal).catch(() => []);
    // Discovered titles come first, then only the static names not already covered by a
    // discovered category of the same topic, capped hard to keep the request budget low.
    const discoveredTopics = new Set(discovered.map((title) => CATEGORY_TOPICS.find((topic) => title.toLowerCase().startsWith(topic.toLowerCase()))));
    const remainingStatic = staticNames.filter((name) => !discoveredTopics.has(CATEGORY_TOPICS.find((topic) => name.toLowerCase().startsWith(topic.toLowerCase()))));
    // Cap raised from 8 to 10 so the two dining categories are not crowded out by
    // discovered sightseeing ones — the dining fallback is the whole point of adding them.
    const categoryNames = [...new Set([...discovered, ...remainingStatic])].slice(0, 10);
    const categoryResults = await Promise.all(categoryNames.map(async (category) => {
      try {
        // incategory: search sorted by incoming links instead of list=categorymembers: the
        // latter returns members ALPHABETICALLY, so huge categories ("Tourist attractions in
        // London") yielded obscure A–B articles while Tower Bridge and Trafalgar Square never
        // made the cut. Incoming-link order surfaces the most notable members first.
        const data = await fetchJson(makeUrl(WIKIPEDIA_API, {
          action: "query", list: "search", srsearch: `incategory:"${category}"`,
          srsort: "incoming_links_desc", srnamespace: "0", srlimit: "18", format: "json", origin: "*"
        }), signal);
        // Tag each hit with the category it came from: an article's own title rarely says
        // it is a restaurant, so this is what lets dining places be typed as "eat" below.
        return (data?.query?.search || []).map((hit) => ({ ...hit, fromCategory: category }));
      } catch (_) {
        // Many destinations do not have every category. Keep going with the categories that exist.
        return [];
      }
    }));
    // Interleave round-robin across categories so a long first category can't crowd the later
    // ones (e.g. casinos, malls) out of the overall cap. Each category list arrives sorted by
    // incoming links, so the position within its list is a notability rank — recorded as a
    // score boost, because prop=pageviews only returns data for a handful of pages per batch.
    const cityContainerPattern = new RegExp(`^(?:central |greater |downtown |inner )?${escapeRegExp(city)}(?: city cent(?:re|er))?$`, "i");
    const categoryNameSet = new Set(categoryNames.map((name) => name.toLowerCase()));
    const rankBoosts = new Map();
    const pageIds = new Set();
    const foodPageIds = new Set();
    const shopPageIds = new Set();
    const maxLength = Math.max(0, ...categoryResults.map((list) => list.length));
    for (let position = 0; position < maxLength; position += 1) {
      for (const list of categoryResults) {
        const item = list[position];
        if (!item || !item.pageid) continue;
        const title = String(item.title || "");
        if (/list of|timeline of|history of/i.test(title)) continue;
        if (NON_ATTRACTION_TITLE_PATTERN.test(title) || cityContainerPattern.test(title)) continue;
        // Skip category-container articles ("Parks and open spaces in London") whether or not
        // that exact category was queried this run — they describe groups, not visitable places.
        if (categoryNameSet.has(title.toLowerCase()) || /^(tourist attractions|landmarks|museums|parks(?: and open spaces)?|beaches|shopping (?:malls|centres|centers)|casinos|amusement parks)\b.*\b(?:in|of)\b/i.test(title)) continue;
        pageIds.add(item.pageid);
        if (!foodPageIds.has(item.pageid) && FOOD_CATEGORY_PATTERN.test(String(item.fromCategory || ""))) foodPageIds.add(item.pageid);
        if (!shopPageIds.has(item.pageid) && SHOP_CATEGORY_PATTERN.test(String(item.fromCategory || ""))) shopPageIds.add(item.pageid);
        if (!rankBoosts.has(item.pageid)) rankBoosts.set(item.pageid, Math.max(0, 44 - position * 3));
      }
    }
    const ids = [...pageIds].slice(0, 45);
    if (!ids.length) return [];
    const pages = await fetchJson(makeUrl(WIKIPEDIA_API, {
      action: "query", pageids: ids.join("|"), prop: "pageviews|coordinates|pageimages|extracts|info", exintro: "1", explaintext: "1",
      piprop: "thumbnail", pithumbsize: "640", inprop: "url", format: "json", origin: "*"
    }), signal);
    return Object.values(pages?.query?.pages || {}).filter((page) => wikipediaPageLooksVisitable(page)).map((page) => ({
      name: page.title,
      type: foodPageIds.has(page.pageid) ? "eat"
        : (shopPageIds.has(page.pageid) || /market|mall|shopping|rodeo drive|grove|bazaar|arcade|outlet|emporium|department store|flea market|night market|souk/i.test(page.title || "")) ? "buy"
          : "see",
      area: city,
      ...(foodPageIds.has(page.pageid) ? { cuisine: "Notable local restaurant" } : {}),
      detail: String(page.extract || (foodPageIds.has(page.pageid)
        ? "A Wikipedia-listed restaurant worth researching and verifying before visiting."
        : "A Wikipedia-listed attraction worth researching and verifying before visiting.")).split(/\n/)[0].slice(0, 240),
      image: wikipediaThumbnail(page),
      lat: coordinate(page.coordinates?.[0]?.lat),
      lon: coordinate(page.coordinates?.[0]?.lon),
      popularity: averageDailyPageviews(page),
      rankBoost: rankBoosts.get(page.pageid) || 0,
      sourceLabel: "Wikipedia category",
      sourceUrl: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(String(page.title || "").replace(/\s+/g, "_"))}`,
      sourceId: `wikipedia:${page.pageid || slugify(page.title)}`,
      sourceLicense: "CC BY-SA 4.0",
      sourceAttribution: "Wikipedia contributors"
    }));
  }

  function osmElementLatLon(element) {
    return {
      lat: coordinate(element.lat ?? element.center?.lat),
      lon: coordinate(element.lon ?? element.center?.lon)
    };
  }

  function cuisineLabel(tags = {}) {
    if (tags.cuisine) return String(tags.cuisine).split(";").slice(0, 3).map((part) => titleCaseWords(part.replace(/_/g, " "))).join(", ");
    if (tags.amenity === "cafe") return "Cafe";
    if (tags.amenity === "bakery" || tags.shop === "bakery") return "Bakery";
    if (tags.amenity === "restaurant") return "Restaurant";
    if (tags.amenity === "food_court") return "Food court";
    return "Local food";
  }

  function shopLabel(tags = {}) {
    const value = tags.shop || tags.amenity || tags.tourism || "";
    const labels = {
      mall: "Shopping mall and major retail",
      department_store: "Department store and shopping",
      marketplace: "Market, food goods, and local browsing",
      clothes: "Fashion and apparel",
      boutique: "Boutiques and local fashion",
      books: "Books, stationery, and gifts",
      gift: "Souvenirs and gifts",
      art: "Art, design, and local makers",
      antiques: "Antiques and vintage browsing",
      jewelry: "Jewelry and accessories",
      supermarket: "Groceries and practical supplies"
    };
    return labels[value] || titleCaseWords(String(value || "Shopping").replace(/_/g, " "));
  }

  function titleCaseWords(value = "") {
    return String(value).replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  }

  function osmPopularityScore(tags = {}) {
    let score = 0;
    if (tags.wikipedia || tags.wikidata) score += 34;
    if (tags.website || tags["contact:website"]) score += 10;
    if (tags.brand || tags.operator) score += 6;
    if (tags.tourism === "attraction") score += 8;
    if (tags.amenity === "restaurant") score += 16;
    if (tags.amenity === "cafe") score += 14;
    if (tags.amenity === "food_court") score += 13;
    if (tags.shop === "bakery") score += 12;
    if (tags.shop === "mall" || tags.shop === "department_store") score += 18;
    if (tags.amenity === "marketplace") score += 16;
    if (/boutique|clothes|gift|books|art|antiques|jewelry/.test(tags.shop || "")) score += 12;
    return score;
  }

  // OpenStreetMap's wikipedia tag ("en:Dotonbori") names the exact article for a place.
  // That is an authoritative link rather than a guess, so the app can fetch that page's
  // photo directly — no title matching, and it fills in cards that would otherwise fall
  // back to a category illustration.
  function osmWikipediaTitle(tags = {}) {
    const value = String(tags.wikipedia || "").trim();
    if (!value) return "";
    const match = value.match(/^([a-z-]{2,12}):(.+)$/i);
    if (match) return match[1].toLowerCase() === "en" ? match[2].trim() : "";
    return value;
  }

  function osmImage(tags = {}) {
    const commonsValue = String(tags.wikimedia_commons || "").trim();
    if (/^File:/i.test(commonsValue)) return commonsImageUrl(commonsValue);
    if (/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/i.test(commonsValue)) {
      const fileName = commonsValue.split("/wiki/File:").pop();
      try { return commonsImageUrl(decodeURIComponent(fileName)); }
      catch (_) { return commonsImageUrl(fileName); }
    }
    const direct = String(tags.image || "").split(";")[0].trim();
    if (/^https:\/\/upload\.wikimedia\.org\//i.test(direct)) return usablePlaceImage(direct);
    if (/^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//i.test(direct)) return usablePlaceImage(direct);
    return "";
  }

  function osmToDynamicItem(element, destination, geocode) {
    const tags = element.tags || {};
    const name = tags.name || tags["name:en"] || tags.brand || "";
    if (!name || /^(restaurant|cafe|shop|market)$/i.test(name)) return null;
    const { lat, lon } = osmElementLatLon(element);
    // amenity=bar/pub legitimately serve food, but a venue whose own name or description
    // reads as a nightclub does not belong under "Places to eat".
    const isNightlife = tags.amenity === "nightclub"
      || isNightlifeListing(String(tags.name || ""), String(tags["description:en"] || tags.description || ""));
    const isFood = !isNightlife
      && (Boolean(tags.amenity && /^(restaurant|cafe|fast_food|food_court|bar|pub)$/i.test(tags.amenity)) || tags.shop === "bakery");
    const isShop = Boolean(tags.shop) || tags.amenity === "marketplace";
    if (!isFood && !isShop) return null;
    const area = [tags["addr:neighbourhood"], tags["addr:suburb"], geocode?.name].filter(Boolean)[0] || geocode?.name || destination;
    const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean).join(" ");
    const image = osmImage(tags);
    const sourceDescription = String(tags["description:en"] || tags.description || tags.short_description || "").replace(/\s+/g, " ").trim();
    if (isFood) {
      const cuisine = cuisineLabel(tags);
      return {
        name,
        type: "eat",
        area,
        address,
        officialUrl: tags.website || tags["contact:website"] || "",
        lat,
        lon,
        image,
        cuisine,
        order: cuisine === "Cafe" ? "Check coffee, pastries, and breakfast options." : "Check current menu favorites and signature dishes.",
        detail: sourceDescription || `${name} is an OpenStreetMap-listed ${cuisine.toLowerCase()} option in ${area}. Verify current hours, popularity, reservations, and menu before locking it into the plan.`,
        sourceLabel: "OpenStreetMap",
        sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        sourceId: `osm:${element.type}/${element.id}`,
        sourceLicense: "ODbL 1.0",
        sourceAttribution: "OpenStreetMap contributors",
        osmScore: osmPopularityScore(tags),
        wikipediaTitle: osmWikipediaTitle(tags)
      };
    }
    const bestFor = shopLabel(tags);
    return {
      name,
      type: "buy",
      area,
      address,
      officialUrl: tags.website || tags["contact:website"] || "",
      lat,
      lon,
      image,
      bestFor,
      detail: sourceDescription || `${name} is an OpenStreetMap-listed shopping option in ${area}, useful for ${bestFor.toLowerCase()}. Verify current stores, hours, and fit before travel.`,
      sourceLabel: "OpenStreetMap",
      sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      sourceId: `osm:${element.type}/${element.id}`,
      sourceLicense: "ODbL 1.0",
      sourceAttribution: "OpenStreetMap contributors",
      osmScore: osmPopularityScore(tags),
      wikipediaTitle: osmWikipediaTitle(tags)
    };
  }

  function destinationResearchCenters(destination, geocode) {
    const fallback = findDestinationFallback(destination, geocode);
    const candidates = [
      {
        name: geocode?.name || destination,
        latitude: coordinate(geocode?.latitude),
        longitude: coordinate(geocode?.longitude)
      },
      ...(Array.isArray(fallback?.searchCenters) ? fallback.searchCenters : [])
    ];
    const seen = new Set();
    return candidates.filter((center) => {
      const latitude = coordinate(center?.latitude);
      const longitude = coordinate(center?.longitude);
      if (latitude === null || longitude === null) return false;
      const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      center.latitude = latitude;
      center.longitude = longitude;
      return true;
    }).slice(0, 4);
  }

  async function fetchOpenStreetMapRecommendations(destination, geocode, signal) {
    if (!geocode?.latitude || !geocode?.longitude) return [];
    const radius = Number(geocode.population || 0) > 2000000 ? 20000 : Number(geocode.population || 0) > 500000 ? 14000 : 12000;
    const centers = destinationResearchCenters(destination, geocode);
    const around = (filter) => centers.map((center) =>
      `  nwr(around:${radius},${center.latitude},${center.longitude})${filter}["name"];`
    ).join("\n");
    const foodQuery = `[out:json][timeout:12];
(
${around('["amenity"~"^(restaurant|cafe|fast_food|food_court|bar|pub)$"]')}
${around('["shop"="bakery"]')}
);
out center tags 120;`;
    const shopQuery = `[out:json][timeout:12];
(
${around('["amenity"="marketplace"]')}
${around('["shop"~"^(mall|department_store|boutique|clothes|gift|books|art|antiques|jewelry|supermarket)$"]')}
);
out center tags 120;`;
    const [foodResult, shopResult] = await Promise.allSettled([
      fetchOverpass(foodQuery, signal),
      fetchOverpass(shopQuery, signal)
    ]);
    const elements = [
      ...(foodResult.status === "fulfilled" ? foodResult.value?.elements || [] : []),
      ...(shopResult.status === "fulfilled" ? shopResult.value?.elements || [] : [])
    ];
    const ranked = dedupeItems(elements.map((element) => osmToDynamicItem(element, destination, geocode)).filter(Boolean))
      .sort((a, b) => (Number(b.osmScore || 0) + tourismScore(b, destination)) - (Number(a.osmScore || 0) + tourismScore(a, destination)));
    // Keep independent quotas so a restaurant-dense destination cannot crowd markets and
    // shopping places out of the single Overpass result window.
    return [
      ...ranked.filter((item) => item.type === "eat").slice(0, 40),
      ...ranked.filter((item) => item.type === "buy").slice(0, 30)
    ];
  }

  const TOURISM_KEYWORD_WEIGHTS = new Map([
    ["zoo", 34], ["beach", 32], ["park", 30], ["balboa", 30], ["griffith", 30],
    ["observatory", 30], ["getty", 30], ["universal studios", 30], ["hollywood", 28],
    ["seaworld", 30], ["sea world", 30], ["casino", 28], ["castle", 26], ["museum", 26], ["aquarium", 25],
    ["palace", 24], ["cathedral", 24], ["monument", 24], ["abbey", 22], ["gallery", 22],
    ["historic", 22], ["old town", 22], ["waterfront", 20], ["tower", 20], ["pier", 20], ["cove", 20],
    ["sanctuary", 22], ["protected landscape", 22], ["national park", 22], ["river", 20], ["cave", 20],
    ["waterfall", 20], ["island", 18], ["church", 18], ["temple", 18], ["nature reserve", 18],
    ["view", 18], ["garden", 18], ["bridge", 16], ["resort", 16], ["market", 16], ["fountain", 16],
    ["square", 14], ["village", 14], ["mall", 12], ["shopping", 12], ["district", 10], ["studio", 10]
  ]);

  const SEEDED_DESTINATION_CATALOGS = [
    {
      aliases: ["san diego", "san diego california", "san diego ca"],
      admin1: ["california", "ca"],
      country: ["united states", "usa", "us"],
      label: "San Diego, California, United States",
      items: [
        { name: "San Diego Zoo", type: "see", area: "Balboa Park", detail: "World-famous zoo in Balboa Park, known for expansive habitats, pandas, koalas, and a full-day family-friendly layout.", seedRank: 100 },
        { name: "Balboa Park", type: "see", area: "Central San Diego", detail: "San Diego’s signature cultural park, with Spanish Colonial Revival architecture, gardens, museums, walking paths, and the San Diego Zoo.", seedRank: 98 },
        { name: "La Jolla Cove", type: "see", area: "La Jolla", detail: "Scenic coastal cove famous for sea caves, seals and sea lions, sunset views, snorkeling, and walkable village restaurants.", seedRank: 96 },
        { name: "SeaWorld San Diego", type: "see", area: "Mission Bay", detail: "Large marine theme park with shows, rides, aquariums, and family attractions near Mission Bay.", seedRank: 94 },
        { name: "USS Midway Museum", type: "see", area: "Embarcadero", detail: "Historic aircraft carrier museum on the waterfront, with flight deck views, restored aircraft, and immersive naval history exhibits.", seedRank: 92 },
        { name: "Coronado Beach", type: "see", area: "Coronado", detail: "Wide, classic Southern California beach known for golden sand, views near Hotel del Coronado, and an easy island-town day trip.", seedRank: 90 },
        { name: "Torrey Pines State Natural Reserve", type: "see", area: "La Jolla / Del Mar", detail: "Clifftop hiking reserve with ocean views, rare Torrey pine trees, and trails that work especially well for a scenic morning.", seedRank: 88 },
        { name: "Old Town San Diego State Historic Park", type: "see", area: "Old Town", detail: "Historic district with preserved buildings, museums, plazas, Mexican restaurants, and an easy introduction to early California history.", seedRank: 86 },
        { name: "Cabrillo National Monument", type: "see", area: "Point Loma", detail: "National monument with bay and ocean views, tide pools, lighthouse history, and one of the best panoramas of San Diego.", seedRank: 84 },
        { name: "Mission Beach and Belmont Park", type: "see", area: "Mission Beach", detail: "Beach boardwalk, oceanfront food stops, bike paths, and the vintage Giant Dipper coaster at Belmont Park.", seedRank: 82 },
        { name: "Little Italy Mercato Farmers' Market", type: "buy", area: "Little Italy", detail: "Popular open-air market for local produce, flowers, snacks, artisan foods, and casual browsing.", bestFor: "Food gifts, flowers, local makers, and snacks", seedRank: 76 },
        { name: "Seaport Village", type: "buy", area: "Embarcadero", detail: "Waterfront shopping and dining village with souvenir shops, bay views, and an easy stroll near downtown attractions.", bestFor: "Souvenirs, casual dining, and waterfront browsing", seedRank: 74 },
        { name: "Liberty Public Market", type: "buy", area: "Liberty Station", detail: "Indoor public market with food vendors, local goods, and a relaxed stop that pairs well with Point Loma or airport-area plans.", bestFor: "Local food vendors, gifts, and casual meals", seedRank: 72 },
        { name: "Fashion Valley", type: "buy", area: "Mission Valley", detail: "Major open-air shopping center with designer, department, and mainstream retail options.", bestFor: "Large-format retail, fashion, and department stores", seedRank: 70 },
        { name: "Morning Glory", type: "eat", area: "Little Italy", detail: "Popular brunch spot known for playful design, pancakes, soufflé dishes, and a lively Little Italy location.", cuisine: "Brunch / American", order: "Pancakes, breakfast carbonara, or a seasonal brunch special.", seedRank: 80 },
        { name: "The Taco Stand", type: "eat", area: "La Jolla / Downtown", detail: "Casual taco favorite with Baja-style tacos, carne asada, al pastor, and quick-service energy.", cuisine: "Mexican / Baja tacos", order: "Al pastor tacos, carne asada tacos, or fresh guacamole.", seedRank: 78 },
        { name: "Las Cuatro Milpas", type: "eat", area: "Barrio Logan", detail: "Long-running cash-style Mexican institution known for handmade tortillas, simple plates, and local character.", cuisine: "Mexican", order: "Rolled tacos, rice and beans, or chorizo con huevo.", seedRank: 76 },
        { name: "Ironside Fish & Oyster", type: "eat", area: "Little Italy", detail: "Seafood-focused restaurant in Little Italy with oysters, lobster rolls, and a strong coastal San Diego feel.", cuisine: "Seafood", order: "Oysters, lobster roll, or catch-of-the-day specials.", seedRank: 74 },
        { name: "Hodad's", type: "eat", area: "Ocean Beach", detail: "Iconic San Diego burger stop with surf-town personality and oversized burgers.", cuisine: "Burgers / casual American", order: "Classic bacon cheeseburger and onion rings.", seedRank: 72 }
      ]
    },
    {
      aliases: ["los angeles", "los angeles california", "los angeles ca", "la california", "la ca"],
      admin1: ["california", "ca"],
      country: ["united states", "usa", "us"],
      label: "Los Angeles, California, United States",
      items: [
        { name: "Griffith Observatory", type: "see", area: "Griffith Park / Los Feliz", detail: "Classic Los Angeles viewpoint with skyline views, astronomy exhibits, hiking nearby, and one of the city’s best sunset angles.", seedRank: 100 },
        { name: "Santa Monica Pier", type: "see", area: "Santa Monica", detail: "Iconic oceanfront pier with Pacific Park, beach views, casual food, and an easy connection to the beach path.", seedRank: 98 },
        { name: "The Getty Center", type: "see", area: "Brentwood", detail: "Major art museum campus known for architecture, gardens, city views, and a high-impact half-day cultural visit.", seedRank: 96 },
        { name: "Universal Studios Hollywood", type: "see", area: "Universal City", detail: "Film-studio theme park with rides, shows, and the Studio Tour; best planned as a dedicated half or full day.", seedRank: 94 },
        { name: "Hollywood Walk of Fame", type: "see", area: "Hollywood", detail: "Famous Hollywood Boulevard walk near TCL Chinese Theatre and Dolby Theatre; best as a short stop paired with nearby viewpoints or museums.", seedRank: 92 },
        { name: "Venice Beach Boardwalk", type: "see", area: "Venice", detail: "Lively beach walk known for murals, skate culture, street performers, Muscle Beach, and access to Venice canals.", seedRank: 90 },
        { name: "The Broad", type: "see", area: "Downtown LA", detail: "Contemporary art museum in Downtown LA, popular for its architecture, collection, and timed-entry planning.", seedRank: 88 },
        { name: "Los Angeles County Museum of Art", type: "see", area: "Museum Row / Miracle Mile", detail: "Large art museum known for Urban Light, broad collections, and easy pairing with the Academy Museum or La Brea Tar Pits.", seedRank: 86 },
        { name: "Grand Central Market", type: "eat", area: "Downtown LA", detail: "Historic food hall with a dense mix of casual vendors, ideal for flexible lunches and group trips with different tastes.", cuisine: "Food hall / multi-cuisine", order: "Choose tacos, egg sandwiches, pupusas, ramen, or a vendor crawl.", seedRank: 84 },
        { name: "Original Farmers Market", type: "eat", area: "Fairfax", detail: "Long-running market with casual food stalls and easy pairing with The Grove, CBS Television City, or Museum Row.", cuisine: "Market / casual dining", order: "Try a classic market counter meal, pastries, or a snack crawl.", seedRank: 82 },
        { name: "République", type: "eat", area: "Mid-Wilshire", detail: "Popular bakery, brunch, and dinner spot in a dramatic historic building, useful near Museum Row or Hollywood-adjacent plans.", cuisine: "French-Californian / bakery", order: "Pastries, shakshuka, kimchi fried rice, or a dinner entrée.", seedRank: 81 },
        { name: "Porto's Bakery and Cafe", type: "eat", area: "Glendale / Burbank / West Covina", detail: "Beloved Cuban bakery and café known for pastries, savory snacks, cakes, and easy group-friendly ordering.", cuisine: "Cuban bakery / cafe", order: "Cheese rolls, potato balls, guava pastries, or medianoche sandwich.", seedRank: 80 },
        { name: "Philippe The Original", type: "eat", area: "Chinatown / Downtown LA", detail: "Historic Los Angeles institution associated with French dip sandwiches and old-school counter service.", cuisine: "Classic LA / sandwiches", order: "French dip sandwich with mustard and a side.", seedRank: 78 },
        { name: "Guisados", type: "eat", area: "Boyle Heights / Downtown LA", detail: "Casual taco favorite known for braised fillings and sampler-style taco plates.", cuisine: "Mexican / tacos", order: "Taco sampler or cochinita pibil taco.", seedRank: 76 },
        { name: "Langer's Delicatessen", type: "eat", area: "Westlake / MacArthur Park", detail: "Classic Jewish deli especially known for pastrami sandwiches and an old-school Los Angeles lunch stop.", cuisine: "Deli / classic LA", order: "Pastrami sandwich, especially the #19.", seedRank: 75 },
        { name: "Kogi BBQ", type: "eat", area: "Los Angeles food trucks", detail: "Influential Korean-Mexican food truck concept; check current truck location before planning around it.", cuisine: "Korean-Mexican", order: "Short rib tacos, kimchi quesadilla, or sliders.", seedRank: 74 },
        { name: "Din Tai Fung", type: "eat", area: "Glendale / Century City / Arcadia", detail: "Reliable group-friendly dumpling restaurant with locations that pair well with shopping or museum days.", cuisine: "Taiwanese / dumplings", order: "Xiao long bao, spicy wontons, and fried rice.", seedRank: 73 },
        { name: "The Grove", type: "buy", area: "Fairfax", detail: "Outdoor shopping and dining district next to the Original Farmers Market, useful for mainstream retail and easy browsing.", bestFor: "Fashion, gifts, casual dining, and market pairing", seedRank: 80 },
        { name: "Rodeo Drive", type: "buy", area: "Beverly Hills", detail: "Luxury shopping street known for designer storefronts, polished streetscapes, and Beverly Hills sightseeing.", bestFor: "Luxury window shopping, designer brands, and photos", seedRank: 78 },
        { name: "Abbot Kinney Boulevard", type: "buy", area: "Venice", detail: "Walkable boutique street with design shops, coffee, restaurants, and independent fashion near Venice Beach.", bestFor: "Boutiques, design, coffee, and independent finds", seedRank: 76 },
        { name: "Melrose Avenue", type: "buy", area: "West Hollywood / Fairfax", detail: "Shopping corridor known for streetwear, vintage, murals, fashion boutiques, and casual browsing.", bestFor: "Streetwear, vintage, murals, and trend shopping", seedRank: 74 }
      ]
    }
  ];

  // Region and island articles are often "thin" in Wikivoyage and too large for Wikipedia's
  // 10 km geosearch radius. These are not full destination catalogs: they are a compact set of
  // durable, source-backed anchors used to keep a dynamic result useful when a public endpoint
  // is incomplete or rate limited. Live Wikimedia records still merge into and enrich them.
  const DESTINATION_FALLBACK_PROFILES = [
    {
      aliases: ["bohol", "bohol philippines"],
      country: ["philippines", "ph"],
      label: "Bohol, Philippines",
      banner: commonsImageUrl("Chocolate Hills Bohol.JPG", 1200),
      // Bohol is a province-sized island rather than one compact city. Its region article is
      // intentionally broad, while the useful restaurant and shopping listings live on the
      // nearby town pages. Search these pages and commercial clusters as one destination.
      relatedVoyageTitles: ["Tagbilaran", "Dauis", "Baclayon", "Carmen (Bohol)"],
      searchCenters: [
        { name: "Tagbilaran", latitude: 9.6496, longitude: 123.8538 },
        { name: "Panglao / Dauis", latitude: 9.5906, longitude: 123.8171 },
        { name: "Carmen", latitude: 9.8229, longitude: 124.1984 }
      ],
      items: [
        {
          name: "Chocolate Hills",
          type: "see",
          area: "Carmen / central Bohol",
          detail: "Bohol's signature landscape of more than a thousand grass-covered limestone hills, with established viewpoints around Carmen.",
          image: commonsImageUrl("Chocolate Hills Bohol.JPG"),
          lat: 9.91666667,
          lon: 124.16666667,
          seedRank: 110,
          destinationAnchor: true,
          sourceLabel: "Wikipedia",
          sourceUrl: "https://en.wikipedia.org/wiki/Chocolate_Hills",
          sourceId: "wikipedia:318873",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikipedia contributors"
        },
        {
          name: "Philippine Tarsier Sanctuary",
          aliases: ["Philippine Tarsier Foundation", "Tarsier Sanctuary"],
          type: "see",
          area: "Corella",
          detail: "A forest sanctuary and visitor center run for Philippine tarsier conservation in Corella; confirm current visitor rules before going.",
          image: commonsImageUrl("Tarsier Sanctuary, Corella, Bohol (2052878890).jpg"),
          lat: 9.691389,
          lon: 123.953056,
          seedRank: 108,
          destinationAnchor: true,
          sourceLabel: "Wikipedia",
          sourceUrl: "https://en.wikipedia.org/wiki/Philippine_Tarsier_Foundation",
          sourceId: "wikipedia:7819019",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikipedia contributors"
        },
        {
          name: "Alona Beach",
          type: "see",
          area: "Panglao Island",
          detail: "A compact white-sand beach and established snorkeling and diving base on Panglao, close to the island's airport.",
          image: commonsImageUrl("Alona Beach Overview.jpg"),
          lat: 9.54861111,
          lon: 123.77083333,
          seedRank: 106,
          destinationAnchor: true,
          sourceLabel: "Wikipedia",
          sourceUrl: "https://en.wikipedia.org/wiki/Alona_Beach",
          sourceId: "wikipedia:43460415",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikipedia contributors"
        },
        {
          name: "Loboc River",
          type: "see",
          area: "Loboc",
          detail: "A tropical river corridor through southern Bohol, known for green scenery and locally operated river excursions.",
          image: commonsImageUrl("Loboc River Bohol 2017 4.jpg"),
          lat: 9.600872,
          lon: 124.00878,
          seedRank: 104,
          destinationAnchor: true,
          sourceLabel: "Wikipedia",
          sourceUrl: "https://en.wikipedia.org/wiki/Loboc_River",
          sourceId: "wikipedia:21557858",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikipedia contributors"
        },
        {
          name: "Panglao Island",
          type: "see",
          area: "Panglao / Dauis",
          detail: "Bohol's main beach and diving island, linked to Tagbilaran and home to Alona Beach, coastal villages, and marine day-trip bases.",
          image: commonsImageUrl("Panglao Island from air (Bohol; 08-11-2023).jpg"),
          lat: 9.6,
          lon: 123.82,
          seedRank: 102,
          destinationAnchor: true,
          sourceLabel: "Wikipedia",
          sourceUrl: "https://en.wikipedia.org/wiki/Panglao_Island",
          sourceId: "wikipedia:3203970",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikipedia contributors"
        },
        {
          name: "Hinagdanan Cave",
          type: "see",
          area: "Dauis, Panglao Island",
          detail: "A naturally lit limestone cavern with rock formations and an underground lagoon; verify current access and swimming guidance.",
          image: commonsImageUrl("Snorkeling in Hinagdanan Cave.jpg"),
          lat: 9.62527778,
          lon: 123.80111111,
          seedRank: 100,
          destinationAnchor: true,
          sourceLabel: "Wikipedia",
          sourceUrl: "https://en.wikipedia.org/wiki/Hinagdanan_Cave",
          sourceId: "wikipedia:8083883",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikipedia contributors"
        },
        {
          name: "Baclayon Church",
          type: "see",
          area: "Baclayon",
          detail: "A historic coral-stone church complex east of Tagbilaran and a useful anchor for exploring Bohol's Spanish-colonial heritage.",
          image: commonsImageUrl("Baclayon Immaculate Concepcion Church (Tagbilaran East Road, Baclayon, Bohol; 01-12-2023).jpg"),
          lat: 9.6227,
          lon: 123.9122,
          seedRank: 98,
          destinationAnchor: true,
          sourceLabel: "Wikipedia",
          sourceUrl: "https://en.wikipedia.org/wiki/Baclayon_Church",
          sourceId: "wikipedia:44080340",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikipedia contributors"
        },
        {
          name: "Rajah Sikatuna Protected Landscape",
          type: "see",
          area: "Bilar / central-southern Bohol",
          detail: "Bohol's largest remaining tract of natural forest, valued for limestone scenery and bird habitat; use current local access guidance.",
          image: commonsImageUrl("Carmen, Fields in Bohol, Nature of Bohol Island, Philippines.jpg"),
          lat: 9.70527778,
          lon: 124.12416667,
          seedRank: 96,
          destinationAnchor: true,
          sourceLabel: "Wikipedia",
          sourceUrl: "https://en.wikipedia.org/wiki/Rajah_Sikatuna_Protected_Landscape",
          sourceId: "wikipedia:44345906",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikipedia contributors"
        },
        {
          name: "Bohol Bee Farm Restaurant",
          aliases: ["Bohol Bee Farm"],
          type: "eat",
          area: "Dao, Dauis / Panglao",
          address: "Dao, Dauis, Bohol",
          detail: "A cliffside farm restaurant known for organic salads, flower garnishes, house-made ice cream, honey products, and wide sea views.",
          cuisine: "Farm-to-table Filipino / organic",
          order: "Organic garden salad, cassava bread, squash muffins, or house-made ice cream.",
          image: commonsImageUrl("Organic salad bohol bee farm.jpg"),
          lat: 9.576241,
          lon: 123.8244,
          seedRank: 108,
          sourceLabel: "Wikivoyage",
          sourceUrl: "https://en.wikivoyage.org/wiki/Dauis",
          sourceId: "wikivoyage:dauis:bohol-bee-farm",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikivoyage contributors"
        },
        {
          name: "Gerarda's Family Restaurant",
          aliases: ["Gerarda's Place", "Gerarda's"],
          type: "eat",
          area: "Tagbilaran City",
          address: "30 J.S. Torralba Street, Tagbilaran City, Bohol",
          officialUrl: "https://gerardasplace.shop/",
          detail: "A family-house restaurant serving generous Filipino favorites in a warm, home-style setting; the official menu highlights seafood kare-kare, gambas, tortang talong, and pinakbet.",
          cuisine: "Filipino family dining",
          order: "Seafood kare-kare, adobong pusit, shrimp gambas, crispy tadyang, or Bicol Express.",
          image: "https://gerardasplace.shop/public/media/gerardasplace-shop/1.jpg",
          seedRank: 106,
          sourceLabel: "Official site",
          sourceUrl: "https://gerardasplace.shop/",
          sourceId: "official:gerardas-place",
          sourceLicense: "Venue website",
          sourceAttribution: "Gerarda's Place"
        },
        {
          name: "Loboc River Cruise Lunch",
          type: "eat",
          area: "Loboc",
          detail: "A Bohol meal experience that pairs a buffet lunch with a slow river cruise, tropical scenery, and local music; compare current operators before booking.",
          cuisine: "Filipino buffet / river cruise",
          order: "Choose an operator with a clearly published buffet, departure time, and accessibility details.",
          image: commonsImageUrl("Loboc River Bohol 2017 4.jpg"),
          lat: 9.6387,
          lon: 124.0322,
          seedRank: 104,
          sourceLabel: "Wikivoyage",
          sourceUrl: "https://en.wikivoyage.org/wiki/Tagbilaran",
          sourceId: "wikivoyage:tagbilaran:loboc-river-lunch",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikivoyage contributors"
        },
        {
          name: "JJ's Seafood Village",
          aliases: ["JJ's Seaside Restaurant"],
          type: "eat",
          area: "Tagbilaran Bay",
          address: "Knights of Columbus Drive, Poblacion II, Tagbilaran City",
          detail: "A waterfront Tagbilaran restaurant known for seafood and a broad Filipino menu, useful for groups who want a relaxed bay-side meal.",
          cuisine: "Seafood / Filipino",
          order: "Ask about the day's seafood, grilled fish, kinilaw, and group-size platters.",
          image: commonsImageUrl("Philippinefish2.jpg"),
          seedRank: 102,
          sourceLabel: "Wikivoyage",
          sourceUrl: "https://en.wikivoyage.org/wiki/Tagbilaran",
          sourceId: "wikivoyage:tagbilaran:jjs-seafood-village",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikivoyage contributors"
        },
        {
          name: "Jo's Chicken Inato",
          aliases: ["Jo's Chicken Inatô", "Payag Restaurant"],
          type: "eat",
          area: "Poblacion I, Tagbilaran City",
          address: "Carlos P. Garcia East Avenue at S. Matig-a Street, Tagbilaran City",
          detail: "A longstanding local stop specializing in chicken inato, the Cebuano grilled-chicken style, plus Boholano kinilaw and other Filipino dishes.",
          cuisine: "Boholano / grilled chicken",
          order: "Chicken inato with rice, binakhaw or kinilaw, and a local side dish.",
          image: commonsImageUrl("Chicken inasal (Philippines).jpg"),
          seedRank: 100,
          sourceLabel: "Wikivoyage",
          sourceUrl: "https://en.wikivoyage.org/wiki/Tagbilaran",
          sourceId: "wikivoyage:tagbilaran:jos-chicken-inato",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikivoyage contributors"
        },
        {
          name: "Chicken Ati-Atihan",
          type: "eat",
          area: "Cogon, Tagbilaran City",
          address: "Ma. Clara Wharf Road, Cogon, Tagbilaran City",
          detail: "An open-air local restaurant serving Filipino dishes and grilled chicken near the Tagbilaran tourist pier.",
          cuisine: "Filipino / grilled chicken",
          order: "House grilled chicken with rice and a vegetable or seafood side.",
          image: commonsImageUrl("Chicken Inasal.JPG"),
          seedRank: 98,
          sourceLabel: "Wikivoyage",
          sourceUrl: "https://en.wikivoyage.org/wiki/Tagbilaran",
          sourceId: "wikivoyage:tagbilaran:chicken-ati-atihan",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikivoyage contributors"
        },
        {
          name: "Cafe Lawis",
          aliases: ["Café Lawis"],
          type: "eat",
          area: "Dauis, Panglao Island",
          address: "Beside Our Lady of Assumption Church, Dauis, Bohol",
          detail: "An outdoor café beside Dauis Church, shaded by a large tree and looking across the water toward Tagbilaran; the adjoining souvenir shop makes it an easy heritage-route pause.",
          cuisine: "Cafe / Filipino",
          order: "Check the current café menu, local snacks, and cold drinks before visiting.",
          image: commonsImageUrl("Cafe Lawis.JPG"),
          lat: 9.6258,
          lon: 123.8628,
          seedRank: 97,
          sourceLabel: "Wikimedia Commons",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Cafe_Lawis.JPG",
          sourceId: "commons:cafe-lawis",
          sourceLicense: "CC BY-SA 3.0",
          sourceAttribution: "Chris Sel / Wikimedia Commons"
        },
        {
          name: "Sweet Home Cafe",
          aliases: ["Sweet Home Café"],
          type: "eat",
          area: "Poblacion II, Tagbilaran City",
          address: "J. Borja at Remolador Streets, Tagbilaran City",
          detail: "A quiet downtown café serving cakes, pastries, coffee-shop staples, and full meals from early morning into the evening.",
          cuisine: "Cafe / pastries / Filipino mains",
          order: "Pair coffee or tea with a pastry, then check the current all-day meal specials.",
          image: commonsImageUrl("Bohol Kalamay packaged traditionally inside empty coconut shells.jpg"),
          seedRank: 96,
          sourceLabel: "Wikivoyage",
          sourceUrl: "https://en.wikivoyage.org/wiki/Tagbilaran",
          sourceId: "wikivoyage:tagbilaran:sweet-home-cafe",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikivoyage contributors"
        },
        {
          name: "Garden Cafe Tagbilaran",
          aliases: ["Garden Café"],
          type: "eat",
          area: "Poblacion II, Tagbilaran City",
          address: "Juan S. Torralba Avenue, beside St. Joseph the Worker Cathedral, Tagbilaran City",
          detail: "A socially minded café beside Tagbilaran Cathedral, operated with a team that includes members of Bohol's deaf community.",
          cuisine: "Cafe / Filipino and international",
          order: "Check the current breakfast plates, sandwiches, baked items, and daily specials.",
          image: commonsImageUrl("Tagbilaran cathedral Bohol.jpg"),
          seedRank: 94,
          sourceLabel: "Wikivoyage",
          sourceUrl: "https://en.wikivoyage.org/wiki/Tagbilaran",
          sourceId: "wikivoyage:tagbilaran:garden-cafe",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikivoyage contributors"
        },
        {
          name: "BQ Mall",
          aliases: ["Bohol Quality Mall"],
          type: "buy",
          area: "Poblacion II, Tagbilaran City",
          address: "Carlos P. Garcia Avenue, Poblacion II, Tagbilaran City",
          detail: "A central four-storey mall with a supermarket, department store, cinema, and a notably large souvenir section.",
          bestFor: "Bohol food gifts, practical supplies, souvenirs, and central-city browsing",
          image: commonsImageUrl("BQ MALL.jpg"),
          lat: 9.64198,
          lon: 123.85505,
          seedRank: 106,
          sourceLabel: "Wikivoyage",
          sourceUrl: "https://en.wikivoyage.org/wiki/Tagbilaran",
          sourceId: "wikivoyage:tagbilaran:bq-mall",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikivoyage contributors"
        },
        {
          name: "Island City Mall",
          type: "buy",
          area: "Dampas / Dao, Tagbilaran City",
          address: "Rajah Sikatuna Avenue, Dampas, Tagbilaran City",
          detail: "Tagbilaran's largest mall, beside the public market and integrated bus terminal, with a department store, supermarket, cinema, and broad retail mix.",
          bestFor: "One-stop shopping, groceries, practical supplies, and transport connections",
          image: commonsImageUrl("Front View of Island City Mall Bohol Philippines.jpg"),
          lat: 9.65556,
          lon: 123.86929,
          seedRank: 104,
          sourceLabel: "Wikivoyage",
          sourceUrl: "https://en.wikivoyage.org/wiki/Tagbilaran",
          sourceId: "wikivoyage:tagbilaran:island-city-mall",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikivoyage contributors"
        },
        {
          name: "Bohol Bee Farm Shop",
          type: "buy",
          area: "Dao, Dauis / Panglao",
          address: "Dao, Dauis, Bohol",
          detail: "The farm shop pairs naturally with a restaurant visit and carries Bohol Bee Farm honey products, spreads, baked goods, ice cream, and locally made woven goods.",
          bestFor: "Honey products, edible gifts, farm-made treats, and woven crafts",
          image: commonsImageUrl("Store at Bohol bee farm - butikk.jpg"),
          lat: 9.576241,
          lon: 123.8244,
          seedRank: 102,
          sourceLabel: "Wikimedia Commons",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Store_at_Bohol_bee_farm_-_butikk.jpg",
          sourceId: "commons:bohol-bee-farm-shop",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Øyvind Holmstad / Wikimedia Commons"
        },
        {
          name: "Antequera Basket Market",
          type: "buy",
          area: "Antequera",
          detail: "A Bohol craft stop associated with the town's long basket-weaving tradition and useful for locally made baskets, mats, and plant-fiber goods.",
          bestFor: "Boholano baskets, woven mats, and traditional handicrafts",
          image: commonsImageUrl("Antequera, Bohol.jpg"),
          lat: 9.783333,
          lon: 123.9,
          seedRank: 100,
          sourceLabel: "Wikimedia Commons",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Antequera,_Bohol.jpg",
          sourceId: "commons:antequera-basket-market",
          sourceLicense: "CC BY-SA 3.0",
          sourceAttribution: "Bernard Gagnon / Wikimedia Commons"
        },
        {
          name: "Dao Public Market",
          aliases: ["Tagbilaran Public Market", "Dampas Central Public Market"],
          type: "buy",
          area: "Dampas / Dao, Tagbilaran City",
          address: "Beside Island City Mall and the integrated bus terminal, Tagbilaran City",
          detail: "Tagbilaran's main public market is a practical local stop for produce, seafood, snacks, and everyday Boholano shopping.",
          bestFor: "Fresh produce, market snacks, local ingredients, and everyday shopping",
          image: commonsImageUrl("Philippinefish2.jpg"),
          seedRank: 98,
          sourceLabel: "Wikivoyage",
          sourceUrl: "https://en.wikivoyage.org/wiki/Tagbilaran",
          sourceId: "wikivoyage:tagbilaran:dao-public-market",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikivoyage contributors"
        },
        {
          name: "Baclayon Wednesday Market",
          type: "buy",
          area: "Baclayon",
          detail: "A weekly town market where a heritage-route day can include produce, local food goods, and everyday community shopping.",
          bestFor: "Local produce, food gifts, and a small-town market experience",
          image: commonsImageUrl("Bohol craftsB.jpg"),
          seedRank: 96,
          sourceLabel: "Wikivoyage",
          sourceUrl: "https://en.wikivoyage.org/wiki/Baclayon",
          sourceId: "wikivoyage:baclayon:wednesday-market",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikivoyage contributors"
        },
        {
          name: "Aproniana Souvenir Shop",
          type: "buy",
          area: "Baclayon",
          detail: "A souvenir stop listed for Baclayon that fits naturally after the church and heritage-house area; verify the current location and opening hours.",
          bestFor: "Bohol souvenirs, handicrafts, and small gifts",
          image: commonsImageUrl("Bohol handicraftsA.jpg"),
          seedRank: 94,
          sourceLabel: "Wikivoyage",
          sourceUrl: "https://en.wikivoyage.org/wiki/Baclayon",
          sourceId: "wikivoyage:baclayon:aproniana",
          sourceLicense: "CC BY-SA 4.0",
          sourceAttribution: "Wikivoyage contributors"
        }
      ]
    }
  ];

  function normalizeDestinationText(value = "") {
    return String(value).normalize("NFKC").toLocaleLowerCase("en-US")
      .replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/gu, " ").trim();
  }

  function destinationEntryMatches(entry, destination, geocode) {
    const aliases = new Set((entry.aliases || []).map(normalizeDestinationText));
    const input = normalizeDestinationText(destination);
    const geocodeName = normalizeDestinationText(geocode?.name);
    const admin = normalizeDestinationText(geocode?.admin1);
    const country = normalizeDestinationText(geocode?.country);
    const nameMatches = aliases.has(input) || aliases.has(geocodeName);
    if (!nameMatches) return false;
    if (!geocode) return aliases.has(input);
    const adminMatches = !entry.admin1?.length || entry.admin1.map(normalizeDestinationText).includes(admin);
    const countryMatches = !entry.country?.length || entry.country.map(normalizeDestinationText).includes(country);
    return adminMatches && countryMatches;
  }

  function findSeededDestination(destination, geocode) {
    return SEEDED_DESTINATION_CATALOGS.find((entry) => destinationEntryMatches(entry, destination, geocode));
  }

  function findDestinationFallback(destination, geocode) {
    return DESTINATION_FALLBACK_PROFILES.find((entry) => destinationEntryMatches(entry, destination, geocode));
  }

  function seededDestinationItems(destination, geocode) {
    const seed = findSeededDestination(destination, geocode);
    if (!seed) return { items: [], label: "", banner: "" };
    return {
      label: seed.label,
      banner: seed.banner,
      items: seed.items.map((item) => ({
        ...item,
        sourceLabel: "Adtona starter catalog",
        sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.name} ${seed.label}`)}`,
        sourceId: `plantoguide:${slugify(seed.label)}:${slugify(item.name)}`,
        sourceLicense: "Adtona curated catalog",
        sourceAttribution: "Adtona",
        seeded: true
      }))
    };
  }

  function hasSeededDestinationCatalog(destination, geocode) {
    return Boolean(findSeededDestination(destination, geocode));
  }

  function destinationFallbackItems(destination, geocode) {
    const fallback = findDestinationFallback(destination, geocode);
    if (!fallback) return { items: [], label: "", banner: "" };
    return {
      label: fallback.label,
      banner: fallback.banner,
      items: fallback.items.map((item) => ({ ...item, destinationFallback: true }))
    };
  }

  function catalogHasSeededAnchors(catalog, destination, geocode) {
    const seed = seededDestinationItems(destination, geocode);
    const fallback = destinationFallbackItems(destination, geocode);
    const anchors = [
      ...seed.items.filter((item) => item.type === "see").slice(0, 4),
      ...fallback.items.filter((item) => item.type === "see").slice(0, 4)
    ];
    if (!anchors.length) return true;
    const existing = catalog?.attractions || [];
    return anchors.every((anchor) => {
      const anchorKeys = new Set(itemIdentityKeys(anchor));
      return existing.some((item) => itemIdentityKeys(item).some((key) => anchorKeys.has(key)));
    });
  }

  // Word-boundary matchers so "park" cannot match "ballpark"/"parking" and inflate
  // non-tourist venues (sports arenas were outranking landmarks via substring hits).
  const TOURISM_KEYWORD_MATCHERS = new Map(
    [...TOURISM_KEYWORD_WEIGHTS].map(([keyword, weight]) => [new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i"), weight])
  );

  function tourismScore(item, destination = "") {
    const text = [item.name, item.area, item.detail, item.bestFor, item.cuisine].filter(Boolean).join(" ").toLowerCase();
    let score = Number(item.seedRank || 0);
    TOURISM_KEYWORD_MATCHERS.forEach((weight, matcher) => {
      if (matcher.test(text)) score += weight;
    });
    // Real-world notability dominates keyword heuristics: the incoming-links search rank
    // (always available for category items) plus log-scaled average daily Wikipedia
    // pageviews when present, so famous landmarks outrank obscure keyword-heavy pages.
    score += Number(item.rankBoost) || 0;
    if (Number(item.popularity) > 0) score += Math.min(80, Math.round(Math.log10(Number(item.popularity) + 1) * 26));
    if (item.seeded) score += 60;
    if (item.destinationAnchor) score += 60;
    const destinationName = normalizeDestinationText(String(destination || "").split(",")[0]);
    if (destinationName && normalizeDestinationText(text).includes(destinationName)) score += 10;
    if (item.image) score += 8;
    if (/wikipedia|wikivoyage/i.test(item.sourceLabel || "")) score += 4;
    // Lead with the opening entries of a Wikivoyage section: those are the places the
    // article's editors put first, and for destinations with no curated catalog they are
    // the closest thing to a popularity ranking we have. The boost fades after the first
    // few so it orders the head of the list without dominating the rest.
    if (Number.isInteger(item.wikivoyageRank)) score += Math.max(0, 72 - (item.wikivoyageRank * 24));
    return score;
  }

  function rankDynamicItems(items = [], destination = "") {
    return [...items].sort((a, b) => tourismScore(b, destination) - tourismScore(a, destination));
  }

  function distributeFoodItems(eatItems = [], destination, fallbackArea) {
    const food = { breakfast: [], lunch: [], dinner: [] };
    const assigned = new Set();
    const pushUnique = (bucket, item) => {
      const key = slugify(item?.name || "");
      if (!item || !key || assigned.has(key)) return false;
      food[bucket].push(item);
      assigned.add(key);
      return true;
    };
    // Café/bakery -> breakfast; markets & food halls -> lunch; explicit fine-dining -> dinner.
    // Everything else is a general restaurant that works equally for lunch OR dinner, so
    // spread those across lunch and dinner (least-filled first) instead of dumping them all
    // into dinner — otherwise lunch is left with only generic filler.
    const flexible = [];
    eatItems.forEach((item) => {
      const text = `${item.name} ${item.cuisine || ""} ${item.detail || ""}`.toLowerCase();
      if (/cafe|coffee|bakery|brunch|breakfast|pastry|donut|bagel/.test(text)) pushUnique("breakfast", item);
      else if (/food hall|food court|marketplace|market|hawker|fast food/.test(text)) pushUnique("lunch", item);
      else if (/fine dining|steakhouse|izakaya|wine bar|tasting menu|bistro|trattoria|fine-dining/.test(text)) pushUnique("dinner", item);
      else flexible.push(item);
    });
    flexible.forEach((item) => {
      pushUnique(food.lunch.length <= food.dinner.length ? "lunch" : "dinner", item);
    });
    const filler = {
      breakfast: [
        { name: `${destination} neighborhood café`, area: fallbackArea, detail: "Use live Maps research to choose a highly rated breakfast spot near the day’s route.", cuisine: "Café and local breakfast", sourceLabel: "Adtona", sourceUrl: "", researchPrompt: true },
        { name: `${destination} bakery breakfast stop`, area: fallbackArea, detail: "Look for a popular bakery or coffee shop near the morning neighborhood and verify current hours.", cuisine: "Bakery and coffee", sourceLabel: "Adtona", sourceUrl: "", researchPrompt: true },
        { name: `${destination} brunch option`, area: fallbackArea, detail: "Research a well-reviewed brunch spot that fits your group size and morning timing.", cuisine: "Brunch", sourceLabel: "Adtona", sourceUrl: "", researchPrompt: true }
      ],
      lunch: [
        { name: `${destination} local lunch favorite`, area: fallbackArea, detail: "Choose a well-reviewed lunch stop near the day’s sights and verify current hours.", cuisine: "Regional cuisine", sourceLabel: "Adtona", sourceUrl: "", researchPrompt: true },
        { name: `${destination} market lunch stop`, area: fallbackArea, detail: "Find a food hall, public market, or casual counter-service option that works for flexible groups.", cuisine: "Market and casual dining", sourceLabel: "Adtona", sourceUrl: "", researchPrompt: true },
        { name: `${destination} casual neighborhood meal`, area: fallbackArea, detail: "Pick a practical lunch with short travel time and a current menu that fits dietary needs.", cuisine: "Casual local food", sourceLabel: "Adtona", sourceUrl: "", researchPrompt: true }
      ],
      dinner: [
        { name: `${destination} dinner reservation option`, area: fallbackArea, detail: "Research a dinner spot that matches your budget, dietary needs, and route.", cuisine: "Local dinner", sourceLabel: "Adtona", sourceUrl: "", researchPrompt: true },
        { name: `${destination} special dinner pick`, area: fallbackArea, detail: "Look for a memorable dinner option near the evening plan and confirm reservations.", cuisine: "Dinner", sourceLabel: "Adtona", sourceUrl: "", researchPrompt: true },
        { name: `${destination} relaxed evening restaurant`, area: fallbackArea, detail: "Choose a lower-stress dinner close to the final stop or home base.", cuisine: "Relaxed dinner", sourceLabel: "Adtona", sourceUrl: "", researchPrompt: true }
      ]
    };
    Object.keys(food).forEach((bucket) => {
      let guard = 0;
      while (food[bucket].length < 3 && guard < 12) { pushUnique(bucket, filler[bucket][guard % filler[bucket].length]); guard += 1; }
      food[bucket] = food[bucket].slice(0, 9);
    });
    return food;
  }

  function sourceRecord(item = {}) {
    if (!item.sourceLabel && !item.sourceUrl && !item.sourceId) return null;
    return {
      id: item.sourceId || item.sourceUrl || `${item.sourceLabel || "source"}:${slugify(item.name)}`,
      label: item.sourceLabel || "Source",
      url: item.sourceUrl || "",
      license: item.sourceLicense || "",
      attribution: item.sourceAttribution || item.sourceLabel || ""
    };
  }

  function itemSources(item = {}) {
    const records = [...(Array.isArray(item.sources) ? item.sources : [])];
    const direct = sourceRecord(item);
    if (direct) records.push(direct);
    const seen = new Set();
    return records.filter((record) => {
      const key = String(record?.id || record?.url || `${record?.label}:${record?.attribution}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function mergeItemRecords(primary, secondary) {
    const mergedSources = itemSources({ ...secondary, sources: [...itemSources(primary), ...itemSources(secondary)] });
    const aliases = [...new Set([
      ...(Array.isArray(primary.aliases) ? primary.aliases : []),
      ...(Array.isArray(secondary.aliases) ? secondary.aliases : [])
    ].map((value) => String(value || "").trim()).filter(Boolean))];
    return {
      ...secondary,
      ...primary,
      area: primary.area || secondary.area || "",
      detail: primary.detail || secondary.detail || "",
      address: primary.address || secondary.address || "",
      officialUrl: primary.officialUrl || secondary.officialUrl || "",
      image: usablePlaceImage(primary.image) || usablePlaceImage(secondary.image) || "",
      lat: coordinate(primary.lat) ?? coordinate(secondary.lat),
      lon: coordinate(primary.lon) ?? coordinate(secondary.lon),
      aliases,
      destinationAnchor: Boolean(primary.destinationAnchor || secondary.destinationAnchor),
      destinationFallback: Boolean(primary.destinationFallback || secondary.destinationFallback),
      sourceLabel: primary.sourceLabel || secondary.sourceLabel || "",
      sourceUrl: primary.sourceUrl || secondary.sourceUrl || "",
      sourceId: primary.sourceId || secondary.sourceId || "",
      sourceLicense: primary.sourceLicense || secondary.sourceLicense || "",
      sourceAttribution: primary.sourceAttribution || secondary.sourceAttribution || "",
      sources: mergedSources
    };
  }

  function itemIdentityKeys(item = {}) {
    return [...new Set([item.name, ...(Array.isArray(item.aliases) ? item.aliases : [])]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .map((value) => slugify(value))
      .filter(Boolean))];
  }

  function dedupeItems(items = []) {
    const positions = new Map();
    const merged = [];
    items.forEach((item) => {
      const keys = itemIdentityKeys(item);
      if (!keys.length) return;
      const position = keys.map((key) => positions.get(key)).find((value) => value !== undefined);
      if (position !== undefined) {
        merged[position] = mergeItemRecords(merged[position], item);
        itemIdentityKeys(merged[position]).forEach((key) => positions.set(key, position));
        return;
      }
      const nextPosition = merged.length;
      merged.push(mergeItemRecords(item, {}));
      itemIdentityKeys(merged[nextPosition]).forEach((key) => positions.set(key, nextPosition));
    });
    return merged;
  }

  function toPlace(item, fallbackArea) {
    return {
      name: item.name,
      area: item.area || fallbackArea,
      detail: item.detail || "Research this local recommendation before adding it to a final route.",
      address: item.address || "",
      officialUrl: item.officialUrl || "",
      image: usablePlaceImage(item.image),
      lat: coordinate(item.lat),
      lon: coordinate(item.lon),
      aliases: Array.isArray(item.aliases) ? [...item.aliases] : [],
      sourceLabel: item.sourceLabel || "",
      sourceUrl: item.sourceUrl || "",
      sourceId: item.sourceId || "",
      sourceLicense: item.sourceLicense || "",
      sourceAttribution: item.sourceAttribution || "",
      sources: itemSources(item),
      popularity: Number(item.popularity) || 0,
      rankBoost: Number(item.rankBoost) || 0,
      placeholder: Boolean(item.placeholder)
    };
  }

  function itemLooksLikeAttraction(item = {}) {
    if (item.type !== "see" || item.placeholder) return false;
    const title = String(item.name || "");
    const detail = String(item.detail || "").replace(/\s+/g, " ").trim();
    if (NON_ATTRACTION_TITLE_PATTERN.test(title) && !STATION_TITLE_PATTERN.test(title)) return false;
    if (ADMINISTRATIVE_EXTRACT_PATTERN.test(detail)) return false;
    return true;
  }

  function attractionFallbacks(destination, fallbackArea) {
    return [
      {
        name: `${destination} visitor center and orientation`,
        type: "see",
        area: fallbackArea,
        detail: "Start with the official visitor center or tourism office, confirm current headline sights, and collect local route guidance.",
        placeholder: true,
        sourceLabel: "Adtona research checklist",
        sourceId: `plantoguide:research:${slugify(destination)}:visitor-center`,
        sourceLicense: "Adtona generated guidance",
        sourceAttribution: "Adtona"
      },
      {
        name: `${destination} historic center orientation walk`,
        type: "see",
        area: fallbackArea,
        detail: "Use official tourism and map sources to verify a compact orientation walk through the destination's historic or civic center.",
        placeholder: true,
        sourceLabel: "Adtona research checklist",
        sourceId: `plantoguide:research:${slugify(destination)}:historic-center`,
        sourceLicense: "Adtona generated guidance",
        sourceAttribution: "Adtona"
      }
    ];
  }

  function destinationMatchPattern(values = []) {
    const patterns = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
      .map((value) => value.split(/[\s,]+/u).filter(Boolean).map(escapeRegExp).join("[\\s,]+"));
    return patterns.length ? `^(?:${patterns.join("|")})$` : "$^";
  }

  function assembleDynamicCatalog(destination, geocode, sourceData = {}) {
    const seeded = seededDestinationItems(destination, geocode);
    const destinationFallback = destinationFallbackItems(destination, geocode);
    const fallbackArea = seeded.label || destinationFallback.label || [geocode?.name, geocode?.admin1, geocode?.country].filter(Boolean).join(", ") || destination;
    const items = rankDynamicItems(dedupeItems([
      ...(seeded.items || []),
      ...(sourceData.wikivoyageItems || []),
      ...(sourceData.wikipediaItems || []),
      ...(sourceData.osmItems || []),
      ...(destinationFallback.items || [])
    ]), destination);
    const realSee = items.filter(itemLooksLikeAttraction).slice(0, 24).map((item) => toPlace(item, fallbackArea));
    // Food or shopping data alone is not enough for itinerary generation. Two real attractions
    // is the minimum usable signal; explicit research cards safely bring a thin result to four.
    if (realSee.length < 2) return null;
    const see = [...realSee];
    for (const fallback of attractionFallbacks(destination, fallbackArea)) {
      if (see.length >= 4) break;
      see.push(toPlace(fallback, fallbackArea));
    }
    const eatItems = items.filter((item) => item.type === "eat").slice(0, 28).map((item) => ({ ...toPlace(item, fallbackArea), cuisine: item.cuisine || "Local cuisine", order: item.order || "Check the current menu and signature dishes." }));
    const buy = items.filter((item) => item.type === "buy").slice(0, 28).map((item) => ({ ...toPlace(item, fallbackArea), bestFor: item.bestFor || "Local shopping, gifts, and browsing" }));
    const fillerImage = seeded.banner || destinationFallback.banner || [...see, ...eatItems, ...buy].find((item) => item.image)?.image || NEUTRAL_BANNER_PLACEHOLDER;
    const food = distributeFoodItems(eatItems, destination, fallbackArea);
    const zones = see.slice(0, 8).map((item, index) => ({
      name: item.area || item.name,
      icon: ["🏛️", "🌿", "🌆", "🎨", "🧭", "📸", "🛍️", "🌉"][index % 8],
      keywords: [item.name, item.area].filter(Boolean)
    }));
    const slug = slugify([geocode?.name, geocode?.admin1, geocode?.country].filter(Boolean).join(" "));
    const matchPattern = destinationMatchPattern([destination, geocode?.name]);
    return {
      dynamic: true,
      researchMode: true,
      slug,
      matchPattern,
      matchFlags: "iu",
      match: new RegExp(matchPattern, "iu"),
      label: fallbackArea,
      country: geocode?.country || "",
      countryCode: String(geocode?.country_code || "").toUpperCase(),
      banner: fillerImage,
      zones: zones.length ? zones : [{ name: fallbackArea, icon: "🧭", keywords: [destination] }],
      attractions: see,
      food,
      shopping: buy.length ? buy : [
        { name: `${destination} central shopping street`, area: fallbackArea, detail: "Research the main retail street or market district and verify current stores.", bestFor: "Local gifts and browsing", sourceLabel: "Adtona", sourceUrl: "", researchPrompt: true },
        { name: `${destination} artisan market`, area: fallbackArea, detail: "Look for a local maker market, food market, or craft area near the route.", bestFor: "Crafts, food gifts, and souvenirs", sourceLabel: "Adtona", sourceUrl: "", researchPrompt: true },
        { name: `${destination} design and vintage district`, area: fallbackArea, detail: "Find a walkable independent shopping area with boutiques, books, or vintage shops.", bestFor: "Independent finds", sourceLabel: "Adtona", sourceUrl: "", researchPrompt: true }
      ],
      practical: {},
      sources: [
        ...(seeded.items?.length ? [{ label: "Adtona starter catalog", url: "https://www.google.com/maps" }] : []),
        { label: "Wikivoyage", url: sourceData.wikivoyageTitle ? `https://en.wikivoyage.org/wiki/${encodeURIComponent(sourceData.wikivoyageTitle.replace(/\s+/g, "_"))}` : "https://en.wikivoyage.org" },
        { label: "Wikipedia", url: "https://en.wikipedia.org" },
        ...(sourceData.osmItems?.length ? [{ label: "OpenStreetMap", url: "https://www.openstreetmap.org" }] : [])
      ]
    };
  }

  async function buildDynamicCatalog(destination, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PIPELINE_TIMEOUT_MS);
    options.signal?.addEventListener?.("abort", () => controller.abort(), { once: true });
    const rateLimitEpochBefore = rateLimitEpoch;
    const recordOutcome = (catalog) => {
      lastResearchOutcome = {
        destination: String(destination || "").trim(),
        ok: Boolean(catalog),
        rateLimited: !catalog && (rateLimitEpoch !== rateLimitEpochBefore || isWikimediaThrottled()),
        at: Date.now()
      };
      return catalog;
    };
    try {
      const geocode = options.geocode || await geocodeDestination(destination, { signal: controller.signal });
      if (!geocode) return recordOutcome(null);
      const slug = slugify([geocode.name, geocode.admin1, geocode.country].filter(Boolean).join(" "));
      const cached = dynamicCatalogCache.get(slug);
      if (cached && catalogHasSeededAnchors(cached, destination, geocode)) {
        const matchPattern = cached.matchPattern || destinationMatchPattern([destination, geocode?.name]);
        return recordOutcome({ ...cached, matchPattern, matchFlags: cached.matchFlags || "iu", match: new RegExp(matchPattern, cached.matchFlags || "iu") });
      }
      // OSM (Overpass) is the slowest source and supplies mainly eat/shop. Start it, but assemble
      // a partial catalog from the fast Wikimedia sources first — the "See" deck (Wikipedia, with
      // photos) can render right away while OSM finishes and folds in eat/shop.
      const osmPromise = fetchOpenStreetMapRecommendations(destination, geocode, controller.signal).catch(() => []);
      const [voyage, wikiGeo, wikiCategory] = await Promise.all([
        fetchWikivoyageListings([geocode.name, geocode.country].filter(Boolean).join(" "), geocode.name, controller.signal).catch(() => ({ title: "", items: [] })),
        fetchWikipediaGeoPlaces(geocode, controller.signal).catch(() => []),
        fetchWikipediaCategoryPlaces(destination, geocode, controller.signal).catch(() => [])
      ]);
      const wikipediaItems = [...wikiGeo, ...wikiCategory];
      if (typeof options.onPartial === "function") {
        try {
          const partial = assembleDynamicCatalog(destination, geocode, { wikivoyageTitle: voyage.title, wikivoyageItems: voyage.items, wikipediaItems, osmItems: [] });
          if (partial) options.onPartial(partial);
        } catch (_) { /* progressive render is best-effort; the final result below is authoritative */ }
      }
      const osm = await osmPromise;
      const catalog = assembleDynamicCatalog(destination, geocode, { wikivoyageTitle: voyage.title, wikivoyageItems: voyage.items, wikipediaItems, osmItems: osm });
      if (!catalog) return recordOutcome(null);
      const cacheable = { ...catalog, match: undefined };
      dynamicCatalogCache.set(slug, cacheable);
      return recordOutcome(catalog);
    } catch (_) {
      return recordOutcome(null);
    } finally {
      clearTimeout(timer);
    }
  }

  const api = { geocodeDestination, parseWikivoyageListings, stripWikitext, buildDynamicCatalog, dynamicCatalogCache, assembleDynamicCatalog, hasSeededDestinationCatalog, catalogHasSeededAnchors, fetchWikipediaCategoryPlaces, fetchOpenStreetMapRecommendations, slugify, destinationMatchPattern, isWikimediaThrottled, wikimediaRetryAfterMs, noteWikimediaRateLimit, getLastResearchOutcome };
  Object.assign(global, api);
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
