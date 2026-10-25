# How this copy keeps itself up to date

This repository is a copy of
[AVIVASHISHTA29/india-protest-map](https://github.com/AVIVASHISHTA29/india-protest-map)
(the India Protest Map: a static map of protests across India built from GDELT news
data). The upstream project's own documentation is in [README.md](README.md); this
file only describes what is specific to *this* copy.

Two independent loops keep it current, both driven by GitHub Actions on `main`.
Neither needs a server, a database or an API key.

| Loop | Workflow | How often | What it does |
| --- | --- | --- | --- |
| **Data** | `.github/workflows/update.yml` *(upstream's)* | every 30 min (`7,37 * * * *`), on every push, and on demand | Fetches new protest events from GDELT, rebuilds `_site/`, deploys to GitHub Pages and (optionally) Vercel |
| **Code** | `.github/workflows/sync-upstream.yml` *(added here)* | every 6 h (`23 */6 * * *`) and on demand | Merges new commits from the upstream repo into `main` and pushes, which also triggers a rebuild |
| **Setup** | `.github/workflows/setup-pages.yml` *(added here)* | once, when it lands on `main` (and on demand) | Turns on GitHub Pages with "Source: GitHub Actions", which `update.yml`'s deploy step requires |

Nothing is committed by the data loop: the pipeline's working state (its GDELT
bookmark and the clusters it has built) lives in the Actions cache, and the
generated `data/live.json` is inlined into the built page and published as
`_site/data/live.json`.

## Where it is published

* **GitHub Pages** — https://sakshamfit.github.io/protest/
  Enabled automatically by `setup-pages.yml`. If that run is skipped or fails,
  turn it on by hand: **Settings → Pages → Build and deployment → Source:
  GitHub Actions**, then re-run *Update and deploy*.
* **Vercel** — project `india-protest-map`
  (id `prj_QHf2d9oF6zlGeQABqCuLzvlFQBdo`, team `team_TaA1iCNLggWjfrSKGy4nA3Z8`).
  The same `update.yml` run pushes the built `_site/` there, so both hosts stay
  in step. **This stays switched off until one secret is added** — see below.

Vercel's own Git builds are deliberately disabled in `vercel.json`: they would
only rebuild when something is committed, but the data changes without commits.

### The one manual step for Vercel

Repository secrets cannot be written by an automation token, so add the deploy
token yourself once. Create it at <https://vercel.com/account/tokens> (scope:
Full Access to the project, or a Team scope) and then, from a clone of this repo:

```bash
gh secret set VERCEL_TOKEN                      # paste the token when prompted
gh api -X POST repos/sakshamfit/protest/actions/variables -f name=VERCEL_PROJECT_ID -f value=prj_QHf2d9oF6zlGeQABqCuLzvlFQBdo
gh api -X POST repos/sakshamfit/protest/actions/variables -f name=VERCEL_ORG_ID     -f value=team_TaA1iCNLggWjfrSKGy4nA3Z8
```

(The two variables can also be set in **Settings → Secrets and variables →
Actions → Variables**.) Until `VERCEL_TOKEN` exists, `update.yml` prints
`No VERCEL_TOKEN secret; skipping` and deploys to Pages only — nothing fails.

Optionally also set the variable `SITE_URL` (for example
`https://<your-project>.vercel.app/`) to make the Vercel host the canonical URL
in meta tags, JSON-LD and `sitemap.xml`. Without it, the Pages URL is used.

## Keeping the schedules alive

GitHub pauses every scheduled workflow in a repository that sees no commit for
60 days, and the data loop never commits. So `sync-upstream.yml`, on its 6-hourly
run:

1. re-enables both workflows through the API (a no-op when they are already on), and
2. once the newest commit is 28 days old, pushes an empty `chore: keepalive commit`
   so GitHub's inactivity clock is reset before it can ever expire.

If updates ever do stop, check **Actions** for a paused workflow and press
*Enable workflow*, then *Run workflow* on **Update and deploy**.

## When a code sync cannot be merged

If you edit the same lines that upstream later changes (most likely
`README.md`, `index.html` or `data/curated.json`), the sync leaves `main` exactly
as it was, prints a warning, and opens one issue titled
**"Upstream sync needs a merge: …"** listing the files. Finish it by hand:

```bash
git remote add upstream https://github.com/AVIVASHISHTA29/india-protest-map.git   # once
git fetch upstream main
git checkout main
git merge upstream/main      # resolve the listed files
git push
```

Close the issue afterwards; the next scheduled sync then carries on normally.
Keeping local edits in `data/curated.json` (adding checked entries) rarely
conflicts, because upstream appends new entries rather than rewriting old ones.

## Running the pipeline by hand

```bash
npm run update    # fetch GDELT -> data/live.json (needs internet access to data.gdeltproject.org)
npm run build     # build _site/ from data/ + index.html
npm run dev       # build, then serve _site/ locally

# or from the Actions tab:
#   Update and deploy  → Run workflow   (tick "reset" to re-fetch the full 7-day window)
#   Sync from upstream → Run workflow
```

The first run after a fresh clone has no cached state, so it backfills the last
7 days of GDELT on its own (about ten seconds).

## Credit

Event data from [The GDELT Project](https://www.gdeltproject.org/); boundaries,
fonts and the checked entries are credited in [README.md](README.md#credits-and-licence).
All of the map's code and content come from
[AVIVASHISHTA29/india-protest-map](https://github.com/AVIVASHISHTA29/india-protest-map);
upstream ships no licence file, so this copy keeps the project's history and
attribution intact and only adds the two workflows described above plus this file.
