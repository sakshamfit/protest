# India Protest Map

A live, open-source map of protests across India. Every pin links to the news reporting behind it.

- **Site:** https://india-protest-map.vercel.app/
- **Repo:** https://github.com/AVIVASHISHTA29/india-protest-map

The map combines two layers:

| Layer | Where it comes from | How it's updated | Shown as |
|---|---|---|---|
| **Checked entries** | Researched by hand from news reports | Edited in `data/curated.json` | ● Circles |
| **News detections** | The [GDELT 2.0 Event Database](https://www.gdeltproject.org/) | Automatically, every 30 minutes | ● Translucent dots |

The whole project is static. A GitHub Action fetches the data and GitHub Pages hosts the site. There's no server, no database, no API key and no npm dependencies, and it costs nothing to run.

---

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Quick start: deploy to GitHub Pages](#quick-start-deploy-to-github-pages)
- [Running locally](#running-locally)
- [The live data pipeline](#the-live-data-pipeline)
- [Data formats](#data-formats)
- [The frontend](#the-frontend)
- [Adding and reviewing protests](#adding-and-reviewing-protests)
- [Configuration reference](#configuration-reference)
- [Methodology and editorial approach](#methodology-and-editorial-approach)
- [How live is it?](#how-live-is-it)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Ideas for what to build next](#ideas-for-what-to-build-next)
- [Credits and licence](#credits-and-licence)

---

## Features

- **Map of India.** Shows all states and union territories. You can pan and zoom (mouse, trackpad, touch or the +/− buttons).
- **Live news detections.** Protest events reported anywhere in India are pulled from GDELT every 30 minutes, then grouped by day and location.
- **Checked entries.** These are hand-researched protests with a summary, the authorities' response where reported, and source links.
- **Long-running movements.** Ongoing movements, such as the Ladakh statehood movement, stay on the map in every time range.
- **Filters:**
  - Time range: Today / 7 days / 30 days / all of 2026.
  - Issue: click the legend chips.
  - News detections on or off.
  - Include single-outlet reports.
- **Linked map and list.** Click a pin to open its entry in the list. Click an entry to zoom the map to it.
- **Freshness indicator.** Shows when the live data last updated, and warns if updates seem to have stopped.
- **Auto-refresh.** An open page reloads the live data every 5 minutes.
- **Reader suggestions.** The "Suggest a protest" link opens a GitHub issue form.
- **Responsive and accessible.** Works on phones, supports keyboard navigation and light/dark mode, and respects reduced motion.

---

## How it works

```mermaid
flowchart LR
    A[GDELT 2.0<br/>new export file<br/>every 15 min] -->|download zip| B[scripts/fetch-gdelt.mjs]
    S[(.cache/gdelt-state.json<br/>bookmark + groups<br/>Actions cache)] <--> B
    B -->|filter: protest + India<br/>group by day & place| L[(data/live.json)]
    C[(data/curated.json<br/>hand-checked)] --> X
    L --> X[scripts/build-site.mjs]
    I[index.html<br/>map already inlined as SVG] --> X
    X --> P[_site/<br/>on GitHub Pages]
    G[(data/india-states.geojson)] -.one-off:<br/>scripts/build-map.mjs.-> I
    W[GitHub Action<br/>every 30 min] -.runs.-> B
    W -.builds & deploys.-> P
```

1. **GitHub Actions** runs `.github/workflows/update.yml` on a 30-minute schedule. It also runs on every push to `main` and whenever you trigger it manually.
2. The workflow restores the pipeline state from the **Actions cache**, then runs `scripts/fetch-gdelt.mjs`, which:
   - downloads every GDELT export file published since the last run,
   - keeps protests located in India,
   - merges them into its working state (`.cache/gdelt-state.json`) and writes a slim `data/live.json` for the page.
3. The workflow saves `.cache/` back to the Actions cache, so the next run knows where it left off. Nothing is committed to git.
4. `scripts/build-site.mjs` builds `_site/`: it inlines the checked entries and live detections into `index.html`, prerenders recent entries into the list, and writes the sitemap. The workflow deploys that folder to **GitHub Pages**.
5. In the browser, the map and data are already in the page, so the first load makes no extra requests. The page then re-fetches `data/live.json` every 5 minutes.

The state outlines are not loaded at runtime. `scripts/build-map.mjs` projects `data/india-states.geojson` (Web Mercator) into SVG paths and writes them into `index.html` once. Pan, zoom and pinch are about 80 lines of plain JavaScript that move the SVG `viewBox`. There's no mapping library.

---

## Project structure

```
india-protest-map/
├── index.html                      # The whole frontend (HTML + CSS + JS, map inlined as SVG)
├── favicon.svg, og.png, apple-touch-icon.png
├── data/
│   ├── curated.json                # Hand-checked protests (edit this)
│   ├── live.json                   # Generated news detections (gitignored, don't edit)
│   └── india-states.geojson        # State/UT boundaries; input to build-map.mjs only
├── scripts/
│   ├── fetch-gdelt.mjs             # The data pipeline
│   ├── build-site.mjs              # Builds _site/ for Pages
│   └── build-map.mjs               # One-off: geojson -> SVG paths in index.html
├── .github/
│   ├── workflows/update.yml        # Schedule, fetch, build and deploy
│   └── ISSUE_TEMPLATE/
│       └── report-protest.yml      # "Suggest a protest" form
├── .cache/gdelt-state.json         # Pipeline working state (gitignored, kept in Actions cache)
├── _site/                          # Build output (gitignored)
├── package.json                    # Scripts only; no dependencies
└── README.md
```

---

## Quick start: deploy to GitHub Pages

The project is already live at https://india-protest-map.vercel.app/, built from https://github.com/AVIVASHISHTA29/india-protest-map. To run your own copy:

1. **Fork or create a repo** on GitHub, e.g. `india-protest-map`, and push this folder:
   ```bash
   cd india-protest-map
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/india-protest-map.git
   git push -u origin main
   ```
2. **Turn on Pages.** In the repo, go to **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. **Open the site** at `https://<your-username>.github.io/india-protest-map/`.

### Also deploying to Vercel (optional)

The same workflow run can push the built `_site/` to Vercel, so both hosts update every 30 minutes from one pipeline. Vercel's own Git builds are switched off in `vercel.json` (they'd only rebuild on commits, and the data changes without commits).

1. Create a Vercel project (or reuse one) and note its **Project ID** (Project → Settings → General) and **Team ID** (Team → Settings → General).
2. Add repo **variables** `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID`, and optionally `SITE_URL` (the canonical URL used in meta tags and the sitemap, e.g. `https://your-project.vercel.app/`; defaults to the Pages URL).
3. Create a token at https://vercel.com/account/tokens and add it as the repo **secret** `VERCEL_TOKEN` (`gh secret set VERCEL_TOKEN`).

Without the secret, the Vercel step is skipped.

The first run finds no cached state, so it backfills the last 7 days on its own (about 10 seconds). From then on it updates itself. GitHub's scheduler can delay runs, sometimes by half an hour; see [How live is it?](#how-live-is-it).

> The push in step 1 also triggers a run. That first run may fail if Pages isn't set up yet. Re-run it after step 2 (**Actions → Update and deploy → Run workflow**).

---

## Running locally

Requires **Node.js 20+**, which has a built-in `fetch`.

There are no dependencies, so there's nothing to install.

```bash
npm run update       # fetches GDELT data into data/live.json (last 7 days on the first run)
npm run build        # builds _site/
npm run dev          # builds, then serves _site at http://localhost:3000
```

Open the built page from `npm run dev`. A plain `index.html` opened on a `file://` URL has no inlined data and tries to `fetch()` it, which browsers block. Serving the repo folder with any static server (e.g. `python3 -m http.server`) also works, since the page then fetches `data/` itself.

To fetch a shorter window locally:

```bash
BACKFILL_HOURS=24 npm run update
```

To start the pipeline from scratch, delete the working state:

```bash
rm -rf .cache
```

If you change the boundaries in `data/india-states.geojson`, re-run `node scripts/build-map.mjs` to rewrite the SVG in `index.html`. It prints the projection constants; copy them into `P` in the page script.

---

## The live data pipeline

### What GDELT is

The [GDELT Project](https://www.gdeltproject.org/) monitors news worldwide, in many languages, and turns stories into structured "events". It codes each event with:

- **who** did **what** to **whom**, using the [CAMEO](https://parusanalytics.com/eventdata/cameo.dir/CAMEO.Manual.1.1b3.pdf) codebook,
- **where** it happened (place name, latitude, longitude),
- the **source URL** of the article.

A new export file is published every 15 minutes at `http://data.gdeltproject.org/gdeltv2/YYYYMMDDHHMMSS.export.CSV.zip`. The newest one is listed in `lastupdate.txt`.

### What the script does, step by step

`scripts/fetch-gdelt.mjs`:

1. **Loads its saved state** from `.cache/gdelt-state.json`: the timestamp of the last file it processed, plus the existing groups (with their URL slugs).
2. **Finds new files.** It reads GDELT's `lastupdate.txt` and lists every 15-minute timestamp between the bookmark and the latest file.
   - The list is capped at `MAX_FILES` per run.
   - On a fresh start (no cache) it goes back `BACKFILL_HOURS`, 7 days by default.
3. **Downloads and unzips the files**, `CONCURRENCY` (8) at a time, using Node's built-in `zlib`. Files are still applied in order. Each file is tab-separated with 61 columns per row.
   - A 404 (GDELT occasionally skips a slot) is skipped.
   - Any other download error stops the run there. The bookmark stays at the last file handled, so the next run retries.
4. **Filters rows.** A row is kept only if all of these hold:

   | Check | Column | Rule |
   |---|---|---|
   | It's a protest | `EventRootCode` (28) | equals `14` |
   | It happened in India | `ActionGeo_CountryCode` (53) | equals `IN` (FIPS code) |
   | It has a useful location | `ActionGeo_Type` (51) | `2` or higher (state, city or landmark; the bare country centroid `1` is dropped) |
   | It has coordinates | `ActionGeo_Lat/Long` (56/57) | both are numbers |
   | It's recent | `SQLDATE` (1) | within the last `WINDOW_DAYS` days |

5. **Groups rows** by `event date + latitude/longitude rounded to 0.1°`, which is roughly an 11 km cell. Each group accumulates:
   - the total `NumArticles`,
   - a count of each CAMEO event subtype,
   - up to 8 source URLs,
   - up to 40 distinct outlet domains,
   - first-seen and last-seen times.

   If a later row has a more precise location, the group's pin moves there.
6. **Labels each group:**
   - **Event type.** The most common CAMEO subtype:

     | Code | Meaning |
     |---|---|
     | 140 | Protest |
     | 141 | Demonstration or rally |
     | 142 | Hunger strike |
     | 143 | Strike or boycott |
     | 144 | Blockade or road obstruction |
     | 145 | Violent protest or riot |

   - **Headline.** GDELT has no headlines, so the script reads one from the article URL slug. For example, `/students-protest-against-election-commission/article123.ece` becomes "Students protest against election commission". It prefers a slug that contains a protest word (protest, strike, march, rally, dharna, bandh, detained…). If no slug works, the page shows "Protest reported in &lt;place&gt;".
   - **Issue.** Keyword matching on the URL slugs. The rules are in `MOVEMENT_RULES`:
     - `sir`: election commission, CEC, voter, electoral, SIR, ballot, EVM, CJP, cockroach, Dipke…
     - `exam`: exam, paper leak, NEET, SSC, UPSC, NTA, CUET…
     - `ladakh`: Ladakh, Leh, Kargil, sixth schedule, Wangchuk
     - `labour`: worker, wage, strike, union, farmer, kisan, MSP, Anganwadi, ASHA…
     - anything else is `other`
7. **Prunes** groups older than `WINDOW_DAYS`, sorts newest first and caps the total at 3,000 groups.
8. **Saves** the bookmark and full groups to `.cache/gdelt-state.json`, so no file is processed twice and no article is counted twice. It also writes the slim `data/live.json` with only what the page renders.

### The workflow

`.github/workflows/update.yml`:

The workflow is called **Update and deploy**.

- **Triggers:**
  - every 30 minutes, at :07 and :37 (`cron: "7,37 * * * *"`; GitHub delays runs on the hour the most),
  - on every push to `main`,
  - manually, with an optional `reset` checkbox that ignores the cache and re-fetches the full 7-day window.
- Uses `concurrency: update-and-deploy`, so runs never overlap.
- Restores `.cache/` from the Actions cache, runs the fetch, saves `.cache/` again, then builds and deploys. The bot never commits, so the repo history stays clean.
- Permissions: `contents: read`, `pages: write`, `id-token: write`, and `actions: write` (for the cache and the keepalive).
- Passes the Pages URL from `actions/configure-pages` to the build as `SITE_URL`.
- Deploys only `_site/`. Scripts and the cache aren't published.
- **Keepalive.** GitHub disables scheduled workflows in public repos after 60 days without a commit. Once a day (the 00:xx UTC scheduled run) the workflow re-enables itself through the API, which resets that clock.

### The site build

`scripts/build-site.mjs` turns `index.html` and the data into `_site/`:

- inlines `curated.json` and `live.json` into the page, so the first load needs no extra request,
- prerenders recent checked entries and the best-sourced detections into the list, for crawlers and readers without JavaScript,
- fills in the canonical and Open Graph URLs and JSON-LD (`WebSite` and `Dataset`),
- writes `sitemap.xml` and `.nojekyll`, and copies `data/*.json`, `favicon.svg`, `og.png` and `apple-touch-icon.png`.

There's no `robots.txt`. Crawlers only read it at the domain root, and a project Pages site lives under `/india-protest-map/`.

---

## Data formats

### `data/curated.json`, the checked entries

```json
{
  "updated": "2026-10-11",
  "events": [
    {
      "id": "e1",
      "movement": "sir",
      "date": "2026-10-10",
      "city": "New Delhi",
      "venue": "Jantar Mantar",
      "lat": 28.6271,
      "lng": 77.2166,
      "title": "Jantar Mantar 2.0 blocked, mass detentions",
      "summary": "What happened, in your own words.",
      "authorities": "Optional: what police, officials or the government said.",
      "sources": [{ "n": "CBC News", "u": "https://…" }],
      "ongoing": false
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique. Use the next `eN`. |
| `movement` | yes | `sir`, `exam`, `labour`, `ladakh` or `other`. Sets the colour and filter. |
| `date` | yes | `YYYY-MM-DD`. For ongoing movements, the start date. |
| `city`, `venue` | city yes, venue no | Shown in the list and tooltip. |
| `lat`, `lng` | yes | Decimal degrees. Get them from any map by right-clicking the spot. |
| `title` | yes | Short and factual. |
| `summary` | yes | Paraphrase the reporting; don't copy it. |
| `authorities` | no | Shown as a separate indented line. |
| `sources` | yes | At least one `{ n: name, u: url }`. |
| `ongoing` | no | `true` keeps it visible in every time range, with a dashed pin. |

### `data/live.json`, the news detections (generated)

This file is generated on every run and isn't committed (it's in `.gitignore`).

```json
{
  "generatedAt": "2026-10-11T06:00:12.345Z",
  "lastGdeltFile": "20261011061500",
  "source": "GDELT 2.0 Event Database",
  "windowDays": 7,
  "clusters": [
    {
      "id": "2026_10_11_28_6_77_2",
      "date": "2026-10-11",
      "lat": 28.6, "lng": 77.2, "geoType": 4,
      "place": "New Delhi, Delhi",
      "articles": 18,
      "outlets": 2,
      "type": "141",
      "movement": "sir",
      "title": "Students protest against election commission sir deletions",
      "urls": ["https://…"]
    }
  ]
}
```

`outlets` is the number of distinct outlet domains. `urls` holds at most 4 source links.

### `.cache/gdelt-state.json`

The pipeline's full working state: `lastStamp` (the last GDELT file processed) and every group with its URL slugs, domains, CAMEO code counts and first/last-seen times. It lives in the Actions cache between runs and is never published or committed. Delete it (or tick `reset` on a manual run) to start over.

### `data/india-states.geojson`

The boundaries of 37 states and UTs, from [datta07/INDIAN-SHAPEFILES](https://github.com/datta07/INDIAN-SHAPEFILES). They were simplified to about 4% of the original detail with [mapshaper](https://mapshaper.org/), which keeps the file around 40 KB. Each feature has one property, `name`. The page doesn't load this file; it's only the input to `scripts/build-map.mjs`.

---

## The frontend

`index.html` is a single file. It works as-is from a local server; `scripts/build-site.mjs` only inlines the data and fills in URLs for the deployed copy. It uses:

- an inline SVG of the state outlines, pre-projected by `scripts/build-map.mjs`,
- **Anek Latin** (headlines) and **Hind** (body) from Google Fonts, both designed with Indian scripts in mind,
- plain JavaScript for everything else, including pan, zoom and pinch (it moves the SVG `viewBox`).

### Pins

| Pin | Meaning |
|---|---|
| ● solid circle, pulsing | Checked entry from the last 2 days |
| ● solid circle, faded | Older checked entry |
| ◌ dashed ring | Long-running movement |
| ● translucent dot | News detection only. Very faint means single-outlet reports. |
| Number in a dot | Several reports at the same spot, merged into one dot. Bigger dot, more reports. |
| Colour | The issue: amber = voter rolls / EC, blue = exam leaks, teal = workers & farmers, purple = Ladakh, grey = other |

Reports at the same spot (within about 3 km) are merged into one dot, so every dot stays at its true location. Click a merged dot to filter the list to that place; "Show all places" or a click on empty map clears it.

### Behaviour

- **Time ranges** are based on the viewer's current date. Ongoing movements always show.
- **Single-outlet detections** are hidden by default. Groups covered by one outlet are the noisiest part of GDELT.
- The list is sorted newest first. Checked entries come before detections on the same day, and ongoing movements are at the end. It shows at most 400 items.
- The deployed page starts with the data inlined, then re-fetches `data/live.json` every 5 minutes, with cache-busting.
- The status line goes grey and warns if the data is more than 3 hours old.
- On `*.github.io`, the **Suggest a protest** link works out your repo from the URL. On a custom domain, set `REPO_OVERRIDE` at the top of the script, e.g. `"yourname/india-protest-map"`.

### Customising

- **Issues and colours.** Edit `MOVEMENTS` in `index.html`, the CSS variables `--m-*`, and `MOVEMENT_RULES` in the fetch script. Keep the keys the same in all three places.
- **Refresh rate.** Change `LIVE_REFRESH_MIN` in `index.html`.
- **Copy.** The title, subtitle and footer text are plain HTML near the top of `<body>`.

---

## Adding and reviewing protests

There are three ways a protest gets onto the map:

1. **Automatically.** GDELT picks up news coverage, and it appears as a translucent dot, usually 30–90 minutes after first reporting (see [How live is it?](#how-live-is-it)).
2. **Reader suggestions.** Readers use the **Suggest a protest** form. Each suggestion becomes a GitHub issue labelled `protest-report`, with headline, place, date, issue, summary and source link.
3. **Checked entries.** You add an object to `data/curated.json` and push. The site redeploys within a couple of minutes.

A sensible review routine:

- Check the `protest-report` issues.
- Open the source and confirm the date and place.
- Write a short summary in your own words.
- Add the entry to `curated.json`, then close the issue with a link to the commit.

For a big detection (many outlets) that deserves context, add a checked entry for it. The checked entry gets the summary, the authorities' response and the better sources.

---

## Configuration reference

### Fetch script (environment variables)

| Variable | Default | What it does |
|---|---|---|
| `WINDOW_DAYS` | `7` | How many days of detections to keep in `live.json` |
| `BACKFILL_HOURS` | `WINDOW_DAYS × 24` (168) | On a fresh start (no cache), how far back to fetch |
| `MAX_FILES` | `BACKFILL_HOURS × 4` (672) | Max 15-minute GDELT files processed per run |
| `CONCURRENCY` | `8` | Files downloaded in parallel |
| `GDELT_BASE` | `http://data.gdeltproject.org/gdeltv2/` | Download location. Override it to test against a local mirror. |

### Workflow

| Setting | Where | Default |
|---|---|---|
| Schedule | `on.schedule.cron` in `update.yml` | `7,37 * * * *` (every 30 minutes) |
| Reset | "Run workflow" → `reset` | off. On ignores the cache and re-fetches the full 7-day window. |

### Site build

| Variable | Default | What it does |
|---|---|---|
| `SITE_URL` | from `GITHUB_REPOSITORY`, else `http://localhost:3000/` | Base URL for canonical/OG links, JSON-LD and the sitemap. The workflow passes the Pages URL. |

### Frontend

| Constant | Default | What it does |
|---|---|---|
| `REPO_OVERRIDE` | `""` | `owner/repo` for the suggestion link on custom domains |
| `LIVE_REFRESH_MIN` | `5` | How often an open page reloads `live.json` |

---

## Methodology and editorial approach

The map is meant to be a reliable record that people of any political view can check for themselves.

- **Every entry has a source.** Nothing goes on the map without a link a reader can open.
- **Paraphrase, don't copy.** Summaries are written in our own words and kept short.
- **Report responses alongside claims.** Where police, officials, the Election Commission or the government responded (permission refused, allegations rejected, internet shutdowns ordered), the entry says so in its own line.
- **Separate checked from automatic.** Detections are always labelled "Auto-detected" and drawn as a different shape. The footer explains that they can be wrong.
- **Neutral titles.** Titles describe what happened ("Opposition march for CEC's resignation"), not whether it was justified.
- **Mark unconfirmed things as such.** Announced events that weren't confirmed as held are labelled "(announced)".

---

## How live is it?

Roughly 30–90 minutes behind the news, not real time:

- GDELT publishes a new file every 15 minutes, but it already lags the news itself by about 15–60 minutes.
- The workflow is scheduled every 30 minutes, but GitHub often starts scheduled runs 5–30 minutes late, sometimes more.
- GitHub Pages' CDN can cache the page and `live.json` for up to 10 minutes.

Auto-detections are also noisy. Expect geocoding errors, stories about older protests, and the same article mapped to several places. Treat an auto-detected dot as a pointer to reporting, not a confirmed event.

---

## Known limitations

- **GDELT is automated and noisy:**
  - The same protest can appear as several groups.
  - A story datelined in Delhi about a protest elsewhere can be pinned to Delhi.
  - Coverage of past events can slip through.
  - Headlines guessed from URL slugs are sometimes clumsy.
  - The single-outlet filter and source links help, but they don't fix any of this.
- **Coverage is uneven.** GDELT leans on English-language and online outlets. Rural and regional-language protests are under-counted.
- **Issue tags are keyword guesses** from URLs. Many real protests land in "Other issues".
- **There are no crowd or detention numbers** for detections. GDELT doesn't provide them.
- **GitHub's scheduler isn't exact.** Runs can be delayed. GitHub also pauses scheduled workflows in public repos after 60 days without a commit; the daily keepalive step re-enables the workflow to prevent that. If updates still stop, re-enable it in the Actions tab.
- **The Actions cache can be evicted** (after 7 days unused, or when the repo goes over its cache quota). The next run then backfills 7 days from scratch, which takes about 10 seconds.

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| "Live news data hasn't been generated yet" | The workflow hasn't run successfully. Go to Actions → Update and deploy → Run workflow, then check the log. |
| Workflow fails at **deploy-pages** | Set Settings → Pages → Source to **GitHub Actions**, then re-run. |
| Log shows `Stopping at … Will retry next run` | A GDELT download failed (not a 404). The bookmark didn't advance past it, so the next run picks it up. Missing slots (404) are skipped silently. |
| Detections look wrong or duplicated after a change to the script | Run the workflow manually with `reset` ticked to rebuild the state from scratch. |
| `Could not read GDELT lastupdate.txt` | GDELT is down or changed its format. The next run will retry. If it persists, open `http://data.gdeltproject.org/gdeltv2/lastupdate.txt` in a browser and compare. |
| Status says updates may be paused | Check the Actions tab for failed or disabled runs (see the 60-day note above). |
| No data locally | You opened `index.html` directly. Use `npm run dev`. |
| Very few detections | Tick "Include single-outlet reports" or widen the time range. |
| Site shows old data right after a run | The Pages CDN can cache for up to 10 minutes. Wait, or hard-refresh. |
| "Suggest a protest" link missing | You're on a custom domain or localhost. Set `REPO_OVERRIDE`. |

---

## Ideas for what to build next

- **Better headlines.** Fetch each source page's `<title>` in the pipeline, or use GDELT's DOC API, instead of guessing from the URL.
- **Smarter issue tagging.** Run the article titles through an LLM in the workflow to classify the issue and write a one-line summary. Store the result so it runs once per group.
- **Merge duplicates.** Merge groups in the same district on the same day, using the `adm1` code and distance.
- **Add a second source.** Use ACLED (weekly, human-coded, needs a free API key) as a more reliable layer.
- **Archive and timeline.** Keep monthly snapshots of `live.json` and add a time slider showing how protests spread.
- **Per-state pages.** Add shareable links like `?state=Bihar`, plus counts and a mini chart for each state.
- **Alerts.** Post to a Telegram or X bot when a new group passes, say, five outlets.

---

## Credits and licence

- **Event data:** [The GDELT Project](https://www.gdeltproject.org/). GDELT data is free to use; please credit "The GDELT Project".
- **Boundaries:** [datta07/INDIAN-SHAPEFILES](https://github.com/datta07/INDIAN-SHAPEFILES), simplified with [mapshaper](https://github.com/mbloch/mapshaper).
- **Fonts:** [Anek Latin](https://fonts.google.com/specimen/Anek+Latin) and [Hind](https://fonts.google.com/specimen/Hind) (SIL Open Font License).
- **Checked entries** are summaries of reporting by the outlets linked in each entry.

No licence file is included yet. Add one before inviting contributions. MIT is a common choice for the code, and CC BY 4.0 for `curated.json`.
