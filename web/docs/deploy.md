# Sharing, analytics, deploy and the packaged builds

Everything about getting the app *out* — the link preview, the play counter,
Cloudflare Pages, PR previews, and the macOS/iOS bundles.

## Sharing the game

Three pieces, all aimed at the same thing: a board someone can hand to
someone else.

**The link preview.** `index.html` carries no social tags of its own — they are
injected at build time by the `socialMeta` plugin in `vite.config.ts`, because
`og:image` and `og:url` have to be **absolute** (a crawler runs no JavaScript
and will not resolve a relative one) and only the build knows where it is being
published. That comes from **`VITE_SITE_URL`**, origin *and* base path with a
trailing slash; the deploy workflow sets it from the repository variable
`SITE_URL`, and the default is the deployed host so a local build emits the
same tags it will. The plugin is not applied to packaged builds: inside the
macOS and iOS bundles there is no crawler to read the tags, and an absolute
`https://` URL in the HTML is exactly what
`scripts/check-offline-assets.mjs` exists to reject.

The card itself is `public/og.png`, 1200×630, written by `npm run og`
(`scripts/make-og-image.mts`) — rendered from the real app through the same
`window.__ms` seam and SwiftShader launch args the screenshot script uses, from
a fixed seed, so it is reproducible and cannot drift from what the game looks
like. It is a *solid* mid-game, because "minesweeper but on shapes" is the pitch
and a flat grid does not say it.

**The share button**, `src/share.ts`, split pure/impure like `sound.ts`:
`shareUrlFor`/`shareTextFor` hold every rule and are what the unit tests pin,
`shareBoard` wraps the browser. `navigator.share` first (on a phone that is the
share sheet), else the clipboard; a share sheet the player *cancels* falls
through to the clipboard rather than reporting failure, since dismissing one is
a normal outcome. The trap fixed there: `nav.clipboard?.writeText(…)` on a
platform with no clipboard evaluates to `undefined`, which awaits happily — so
the button would have said "Link copied" having copied nothing. It is offered in
**one** place, the record window, and passes the session's seed and the winning
time. The game header carried one too and does not any more: a link is worth
sending when it comes with a time, and the header's two right-hand slots are all
that fits at 320px. They hold the **die** (another board at random, see below)
and the **ⓘ** (what this board is).

**The seed** is what makes any of it mean anything — see "Shareable board
links" in [`ui.md`](ui.md).

## Bundle size

There is **no size budget and no CI gate**. The app is a one-time download that
the service worker then caches, so first-load kilobytes are worth less here than
the board looking right; a change that costs bundle size and buys appearance is
a change worth making. What the build does keep is one piece of hygiene: `three`
is a `manualChunks` entry of its own (`vite.config.ts`), so it keeps its hash
when app code changes and a redeploy re-downloads only the app chunk. The
chunk-size warning limit sits above both chunks — deliberately, so the build log
carries no standing warning nobody intends to act on.

## Analytics

The deployed game counts what is played and how it goes: two events per game to
a Pages Function on this app's own origin, which writes one row each to a
Workers Analytics Engine dataset. It is the only outbound request the app makes;
everything else it knows lives in `localStorage`.

**The events, the dataset schema, the queries and the privacy line are in
[`../../docs/agents/metrics.md`](../../docs/agents/metrics.md)** — one place, so
a positional schema has one description. What belongs *here* is the deploy side
of it: which builds carry a collector, and the binding they need.

**The counter is opt-in per build**, via `VITE_ANALYTICS=1` → the
`__APP_ANALYTICS__` define. Only one place this app runs has the Pages Function
to post to:

| build | counter | why |
| --- | --- | --- |
| Cloudflare deploy | **yes** | the host that serves the Function |
| e2e (`playwright.config.ts` sets it) | **yes** | `analytics.spec.ts` drives it |
| `npm run dev` | no | your own clicks are not data |
| packaged (macOS, iOS) | no | vetoed by `packaged`, whatever the flag says |

This is not tidiness. A post to a host without the Function 404s, and **the
browser logs that failure to the console itself** — no care taken in
`analytics.ts` can swallow it, so a build with nowhere to report to must not
carry a reporter. (`sound.spec.ts` asserts a played board logs no console errors
and is what caught this.) A build that does carry it is served locally by the
`tallyStub` middleware in `vite.config.ts`, which answers `204` exactly as the
Function does, so `vite preview` and `npm run dev` behave like the deployed
host; to exercise the real Function, `wrangler pages dev`.

Where the flag is off, `COLLECTING` is a false constant and the compiler removes
the transport, the endpoint string and the Privacy row along with it. For the
packaged builds that is asserted rather than assumed:
`scripts/check-offline-assets.mjs` gained a second pass over a `FORBIDDEN` list
of same-origin paths, because its URL scan only ever saw absolute `https?://`
ones and would have let a relative endpoint straight through.

The `GAME_EVENTS` binding the collector writes through is declared in
`web/wrangler.toml`; "Deploy" below says why that file has to live in `web/` and
what to check after the first deploy. Analytics Engine datasets are created on
their **first write** — there is nothing to provision, and a dataset that does
not exist reads as an unknown table rather than as an empty result.

## Deploy

CI (`.github/workflows/ci.yml`, `web` job) typechecks, unit-tests, builds and
runs the e2e/visual suite. `deploy-cloudflare.yml` then publishes this app to
Cloudflare Pages on every push to `master` — **it is the deployed game**; the
pygbag build of the pygame version is no longer published (it is still
buildable locally with `make web-package`).

It is served from the domain root, so the job sets no `VITE_BASE` and takes
`vite.config.ts`'s default `"/"`. That path is baked into the bundle at build
time — asset URLs, the PWA manifest, the service worker scope all derive from
it — so a host serving the app from a subdirectory would need a build of its
own rather than a copy of this one.

The job needs two repository secrets, `CLOUDFLARE_API_TOKEN` (a token with the
*Cloudflare Pages: Edit* permission) and `CLOUDFLARE_ACCOUNT_ID`, and a Pages
project that already exists — a direct-upload project named `hypersweeper`
whose production branch is `master`
(`wrangler pages project create hypersweeper --production-branch=master`).
`wrangler pages deploy` does not create one in CI.

That job runs wrangler **from `web/`** (`workingDirectory: web`), which is the
whole reason `web/wrangler.toml` exists: wrangler's project root is the config
file's directory, and `functions/` — the analytics collector — has to sit beside
it to be picked up at all. The config also carries the deploy directory
(`pages_build_output_dir = "dist"`), the project name and the `GAME_EVENTS`
Analytics Engine binding, which is why the deploy command passes neither a
directory nor `--project-name` (passing the directory positionally alongside
that setting is an error). Run from the repo root instead and the deploy quietly
uploads `dist/` alone: the site works and the collector does not exist.

After the first deploy, check that **Pages project → Settings → Functions →
Bindings** lists `GAME_EVENTS`. That is the most likely thing to be wrong, and
its failure is silent — the Function still answers `204` by design, and the
report simply stays empty. If config-file bindings are not honoured for the
project, add it in the dashboard for Production *and* Preview.

Locally, `npm run dev` does not serve `/api/tally`; the post 404s and the game
is unaffected — which is why no local build carries the counter. To run the
Function, `npm run build && npx wrangler pages dev` from `web/` — but note
Analytics Engine writes are a no-op in local dev, so verifying a write end to
end takes a real deploy.

### PR previews

Every pull request gets its own live build, at a URL that does not change as the
branch does:

```
https://pr-<number>.hypersweeper.pages.dev
```

`pr-preview.yml` publishes it on every push to the PR and edits one sticky
comment with the link, so the change can be checked on a phone rather than on a
laptop with the branch checked out; `pr-<number>` is also the Cloudflare
`--branch`, which is both what classifies the deploy as a preview rather than
production and what the alias above is derived from. The git branch name is
deliberately *not* used: Cloudflare lowercases, substitutes and truncates a
branch into an alias, and a name like `claude/pr-deploy-cloudflare-71qkmu` comes
back mangled.

It does not wait for CI — the `web` job installs Chromium and runs the whole
visual suite, and gating on that would put the phone minutes behind the push.
Two things differ from the production bundle, both on purpose. There is no
`VITE_ANALYTICS`, so a preview carries no play counter and preview games stay
out of the real numbers. And `VITE_NO_SW=1` leaves the service worker out: a PR
reuses one URL across pushes, and a root-scoped precache there is a phone
showing the push before last, which is the one failure mode a preview must not
have. `VITE_NO_SW` is the narrow knob for that — `VITE_PACKAGED` also drops the
worker but takes `socialMeta`, `tallyStub`, `versionStamp` and the update row
with it, which is the offline-app build, not this. A preview still emits its
`version.json`, so Settings › Check for updates answers there too — commit
against commit, which is the only comparison that says anything on a URL that
serves many builds under one version number — and with no worker registered the
reload it then performs is the whole update. The job also writes a
`dist/_headers` carrying `X-Robots-Tag: noindex` (into `dist/`, never `public/`, so production
stays indexable) and passes the preview's own origin as `VITE_SITE_URL`, or
every preview's `og:url` and `<link rel="canonical">` would point at production.

Closing or merging the PR deletes every deployment made under `pr-<number>`,
which is what takes the alias with it. wrangler has no
`pages deployment delete`, so the `destroy` job calls the REST API directly:
`force=true` is required for the branch's latest deployment, and the ids are
collected across every page *before* any deletion, since deleting mid-pagination
shifts the pages. **The one thing that can go wrong is the token**: a Cloudflare
API token narrower than *Cloudflare Pages: Edit* deploys perfectly happily and
then fails to delete, so the step reports the API's own errors and exits
non-zero rather than swallowing them. `pr-preview-sweep.yml` is the safety net
under all of this — daily, plus a `workflow_dispatch` button, it deletes the
previews of every `pr-<number>` the GitHub API reports as `closed`, because the
teardown is event-driven and events get missed (a cancelled run, a closed PR
while Actions were off, a deploy landing just after its own cancellation). It
deletes only on an explicit `closed`: an open PR, a number that no longer
exists, or an API hiccup are all left alone, since a stale preview living
another day costs nothing and deleting a live one out from under someone testing
on their phone is the failure that matters.

**Why a fork's pull request gets no preview, and why that guard must stay.**
Both jobs are gated on
`github.event.pull_request.head.repo.full_name == github.repository`. Two
independent things stop a stranger, either sufficient: a fork cannot push a
branch to this repository, and GitHub withholds `secrets.*` from a
`pull_request` run whose head is a fork, so the deploy could not authenticate
even with the guard removed. A job whose `if` is false is skipped before a
runner is allocated, so a hundred drive-by pull requests cost this workflow no
minutes at all. Only someone who can already push a branch here — write access,
which already grants the token and `master` — can cause a preview.

Which is also why the workflow must **never** be moved to
`pull_request_target`: that runs with the secrets *and* a writable token against
fork-authored code, and the build step runs `npm ci`, which executes lifecycle
scripts out of the pull request's own `package.json`. That is a straight
handover of the deploy token to anyone who opens a PR.

Two repository settings do the rest, and they are worth re-checking because
nothing in the repo can enforce them. Settings → Actions → General → *Fork pull
request workflows from outside collaborators* should be **"Require approval for
all outside collaborators"**; the default gates first-time contributors only,
which lets anyone with one merged PR in the past run workflows unprompted
forever after — and the real cost surface for a flood is `ci.yml`, which runs
Python, Node and a Playwright Chromium install on every pull request including
forks. And *Workflow permissions* should default to read-only, with each
workflow granting what it needs in its own `permissions:` block, which is how
they are all written here already.

**The retired GitHub Pages deploy.** The game was published to the project site
as well, under `/hypersweeper/`, while it moved between the two hosts. That
workflow is gone; `redirect-pages.yml` now publishes
`.github/pages-redirect/index.html` there instead — a static page that redirects
to the Cloudflare site, so old links still land on the game. It is deliberately
plain: no script, so a shared board link's query is dropped, and it does not
clear the service worker the last app deploy registered at `/hypersweeper/sw.js`
(the browser drops that registration itself once its update check for `sw.js`
404s, so a returning visitor may see the cached old app one more time). Being
static, it publishes on a change to itself rather than on every push.

During the rewrite this app mounted under `/next/` instead, so
`public/next/index.html` redirects that path to the root, carrying the board
link's query and hash over and unregistering the service worker that was scoped
there; `app.spec.ts` pins it. Visual baselines are only authoritative in the
pinned CI environment (software WebGL / SwiftShader).

### The packaged builds (macOS, iOS)

This same bundle ships inside the macOS app (`make mac-app`, see
[`../../desktop/README.md`](../../desktop/README.md)), where it is served from an `app://` scheme, and inside the
iPhone app (`make ios-app`, see [`../../ios/README.md`](../../ios/README.md)), where a Capacitor WKWebView
serves it from `capacitor://localhost`. Two things about that are worth knowing
while working here:

- **`VITE_PACKAGED=1`** is the variant of the build that ships *inside* an app.
  It drops the service worker (nothing to update from inside a bundle) and, via
  `__APP_PACKAGED__`, the "Check for updates" row on the settings page. It is
  the *only* build-time thing this app knows about either shell — resist adding
  a second branch; if a shell needs different behaviour, the shell should
  provide it. (Runtime is a different matter: `haptics.ts` asks Capacitor at
  call time whether it is running natively, because the *same* bundle has to
  work in a browser tab and on a phone.)
- **The app must reference nothing remote.** No CDN, no web font, no remote
  image: `scripts/check-offline-assets.mjs` scans the built output and fails
  the build (and the `web` CI job) over any URL that is not an XML namespace
  or the settings page's source-code link. Anything the app draws goes in
  `public/` or gets imported. A request need not name a host, though — the
  analytics collector is a *relative* path on whatever origin serves the app —
  so the script has a second pass over a `FORBIDDEN` list of same-origin paths.
  That pass is the only automated proof that `__APP_PACKAGED__` really folded
  the collector out — and, since the update check joined it, the build stamp
  `version.json` too; add to the list, not just to `ALLOWED`, when a same-origin
  endpoint appears.

The README gallery at the repo root is rendered from this app by
`npm run screenshots` (`scripts/make-screenshots.mts`): it builds, serves
`dist/`, and drives each shot through the `window.__ms` seam with an explicit
mine layout, one theme per shot. Add a row to its `SHOTS` table to add a
picture; `SHOTS=menu.png npm run screenshots` re-renders just one.
