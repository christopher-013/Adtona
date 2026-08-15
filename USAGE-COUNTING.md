# Usage counting

Adtona answers one question about itself: **did a real person finish a trip today?**
adtona.com keeps no visitor logs, so without this there is no way to tell whether
anyone uses it.

## What is stored

A UTC timestamp, one word, and a two-letter country, per event. That is the whole
record.

The country comes from `CF-IPCountry`, which Cloudflare resolves at the edge. Only
A–Z pairs are kept: `XX` (unresolved) and `T1` (Tor) record no country rather than
a fake one. The address it was derived from is used for that and for rate limiting,
and is never written to storage.

No identifier, cookie, session, user agent or IP address is retained, and nothing
about the trip is sent — not the destination, the dates, the answers, or the
recommendations. The request body is the literal `{"event":"trip"}`.

The timestamps are what let the log answer *when*, not only *how many*. They also
mean events close together read as one visit: an `open` at 09:14 followed by a
`trip` at 09:15 is plainly the same session. That is the point of recording them —
but nothing distinguishes one visitor from another, and nothing joins a visit on
one day to a visit on any other, because no request carries anything to join on.

A country is a coarse fact — everyone using the site from one shares it — but it is
still a fact about the visitor, so the privacy notice names it rather than leaving it
covered by "nothing about you is stored".

## Where the count appears

The Worker keeps one integer per UTC day in KV, plus a running total without a TTL
(daily keys expire after ~13 months; the total does not). It maintains a single
GitHub issue titled **Adtona usage log**, whose body shows the running total and
today's figure. Issue writes are throttled to one a minute, so a burst of trips
cannot become a burst of GitHub API calls.

Alongside the counters it writes **one key per event** — `log:YYYY-MM-DD:<ms>-<rand>`,
holding `HH:MM:SS event COUNTRY` (the country omitted when it could not be resolved).
The counters stay authoritative for the numbers; the log is the timeline.

A key per event rather than lines appended to one key is deliberate, and was learned
the hard way. KV reads are eventually consistent — a read can return a value up to a
minute old — so read-modify-write on a shared key does not merely lose the rare
simultaneous ping, it loses most events arriving within that window. The first
version appended to one key per day and collapsed seventeen events into one line.

The issue lives in a public repository, so the log is publicly readable. It contains
nothing but times, event names and country codes.

## Reading the daily history

The issue **body** is rewritten as trips arrive, so it always shows the live running
total and today's figure — but a rewritten body keeps no history.

The history is in the **comments**. A day's comment is filed as soon as its first trip
completes, then kept current as more arrive:

> **2026-07-29 (UTC)** — 5 sessions, 4 trips, 1 export. Running total: 37 trips.
>
> From: US 3 · PH 1
>
> - `08:12:41` UTC — Session · US
> - `08:19:03` UTC — Trip · US
> - `09:47:55` UTC — Session · PH
> - `10:02:18` UTC — Export · US

Still one comment per day rather than one per event, so the thread stays readable
however busy a day gets — the individual events are lines inside it.

The counters and the log can disagree, and the comment distinguishes the two reasons:

- **past the 300-line listing cap** — a genuinely busy day. Only the listing stops;
  the counters keep rising.
- **counted today but not listed individually** — the counters know about events the
  log does not, which is what a mid-day deploy looks like: everything before it was
  counted but never logged per event.

Updates are throttled to one a minute; the first event of a day is never throttled,
because that write is what makes the day appear. The timestamp is stored the moment
the ping lands, so throttling delays when an event is *published*, never whether it
was recorded.

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
