# Search visibility

Adtona ranked well on Google and poorly on Bing for the same query. The two causes were
mechanical, not editorial.

## Why Bing showed a globe instead of the logo

Google reads the `<link rel="icon">` PNGs in `<head>`. Bing does not — its icon service
fetches `/favicon.ico` from the site root and falls back to a generic globe when that
404s, which it did.

`build-favicon.mjs` now packs 16, 32 and 48 px entries into `favicon.ico` at the root
(48 is what both engines render at on dense screens). Re-run it whenever `icons/`
changes:

```bash
node build-favicon.mjs
```

## Why Bing's snippet was a stray privacy sentence

The page had **118 words of visible text**. Everything describing the product — 1,136
words — sat inside closed `<dialog>` elements for Learn More and Privacy. A closed
`<dialog>` is `display: none`, and both engines discount hidden text, so Bing had almost
nothing to quote and picked a fragment at random.

`.landing-about` in `index.html` is now real, visible page text (~500 words): what Adtona
is, how it works, what makes it different, and the six FAQs. It sits **below the fold**
and is hidden past step 1 via `body:not(.trip-basics-mode) .landing-about`, so the
welcome screen and the wizard look exactly as before.

The FAQs moved out of the Learn More dialog for the same reason: Google requires FAQPage
structured data to have a visible counterpart, and it did not have one.

## Brand entity

`"Including results for daytona"` is Bing saying it does not believe "adtona" is a word.
The JSON-LD graph now leads with an `Organization` carrying `logo`, `alternateName`, and
`sameAs` pointing at the Instagram profile — the standard signals for tying a domain,
a name, and a social presence into one entity. More `sameAs` profiles strengthen this.

## Automated

- **IndexNow** — `submit-indexnow.mjs` pings Bing, Yandex, Seznam and Naver on release.
- **`sitemap.xml` `<lastmod>`** — stamped with the deploy date by `build-cloudflare.mjs`.
  A stale `lastmod` slows recrawl rate; hand-editing it is the step that gets forgotten.
- **`robots.txt`** — names `bingbot` and `googlebot` explicitly with `Crawl-delay: 0`.

## A second indexable URL

The privacy notice used to exist only inside a `<dialog>` — ~500 words no crawler saw, on
a site with exactly one indexable URL. `build-privacy-page.mjs` generates `privacy.html`
from that dialog, so the two cannot drift, and `/privacy` is listed in the sitemap, linked
from the crawlable description, and named by the schema.org `privacyPolicy` property.

Edit the dialog in `index.html`, never `privacy.html`, then:

```bash
node build-privacy-page.mjs
```

The sitemap lists `/privacy` without the extension: Cloudflare serves the page there and
answers `/privacy.html` with a 307, so the `.html` form would point crawlers at a redirect
and disagree with the page's own canonical tag.

## Deliberately not copied from Pictayo

Pictayo carries a `<meta name="keywords">` tag. Bing documents keyword meta as a spam
signal and Google has ignored it since 2009, so Adtona has none — it was removed earlier
and should stay removed. Pictayo would be better off dropping it too.

Pictayo also has no root `favicon.ico`, only `favicon.png`, so it has the same Bing icon
gap Adtona just closed. `build-favicon.mjs` ports over cleanly if you want it there.

## Manual, once

These need a logged-in browser and cannot be scripted:

1. **Bing Webmaster Tools** (bing.com/webmasters) — add `adtona.com`, verify (importing
   from Google Search Console is fastest), submit `https://adtona.com/sitemap.xml`, then
   use **URL Inspection → Request Indexing** on the homepage.
2. **Google Search Console** — resubmit the sitemap so the new content is picked up.
3. **Backlinks.** This is the remaining gap and no amount of on-page work substitutes for
   it. Bing weights inbound links more heavily than Google does, and adtona.com has
   almost none. A Product Hunt listing, an r/travel or r/SideProject post, a GitHub
   repository link, and the Instagram bio link are the realistic first ones.

Expect days to weeks for the icon and snippet to change — both engines cache SERP
metadata well past the recrawl.
