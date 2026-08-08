# Usage counting

Adtona answers one question about itself: **did a real person finish a trip today?**
adtona.com keeps no visitor logs, so without this there is no way to tell whether
anyone uses it.

## What is stored

A date and a number. That is the whole record.

No identifier, cookie, session, user agent or IP address is retained, and nothing
about the trip is sent — not the destination, the dates, the answers, or the
recommendations. The request body is the literal `{"event":"trip"}`.

The client address is used as a rate-limit key for the request and is never written
to storage.

## Where the count appears

The Worker keeps one integer per UTC day in KV, plus a running total without a TTL
(daily keys expire after ~13 months; the total does not). It maintains a single
GitHub issue titled **Adtona usage log**, whose body shows the running total and
today's figure. Issue writes are throttled to one a minute, so a burst of trips
cannot become a burst of GitHub API calls.

The issue lives in a public repository, so the counts are publicly readable. They
contain nothing but a date and a number.

## Reading the daily history

The issue **body** is rewritten as trips arrive, so it always shows the live running
total and today's figure — but a rewritten body keeps no history.

The history is in the **comments**. A day's comment is filed as soon as its first trip
completes, then kept current as more arrive:

> **2026-07-29 (UTC)** — 4 trips generated. Running total: 37.

One comment per day rather than one per trip, so the log stays readable however busy a
day gets. Updates are throttled to one a minute; the first trip of a day is never
throttled, because that write is what makes the day appear.

A cron at 08:00 UTC remains as a backstop. It files the previous day only if the live
writes never landed, skips days with no trips, and cannot file a day twice.

## Why the count means real people

A ping is only sent after someone has typed a real destination that resolved through
the geocoder, chosen dates, worked through the recommendation deck, and reached the
end of the question steps. That is not a path a crawler walks.

On top of that:

- Automated sessions that set `navigator.webdriver` are skipped client-side.
- Clients that announce themselves as automation in their user agent are dropped by
  the Worker. The agent string is matched and discarded, never stored.
- The endpoint is origin-locked to adtona.com and rate-limited per address.
- `file://` previews are not counted.
- A completed trip is counted **once**. A refresh, a re-export, or re-rendering the
  same trip will not increment it, because the browser remembers the trip it already
  counted.

The count is therefore a floor, not a precise total: a private-mode visitor who
returns will be counted again, and a lost ping is never retried. It is meant to show
whether the site is used, not to be an exact ledger.

## Activation

One value cannot be guessed — the KV namespace:

```bash
npx wrangler kv namespace create USAGE_COUNTS
```

Put the printed id into `kv_namespaces[0].id` in `wrangler.jsonc`, replacing
`REPLACE_WITH_KV_NAMESPACE_ID`, then deploy:

```bash
npx wrangler deploy
```

It reuses the Issues-scoped `GITHUB_TOKEN` the feedback worker already needs, so
counting adds no new credential and no third-party analytics service.

Until the namespace is bound the endpoint stays live and simply records nothing:
the Worker logs a missing-binding error and still answers 204, so a traveler never
sees a failure.
