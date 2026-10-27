# Staging folder — move these into place, then delete it

The GitHub App connection used to build this repo is not allowed to create files
under `.github/workflows/`, so the three workflows that make this copy update
itself are parked here instead. Nothing in this folder runs.

Put them where GitHub Actions looks for them:

```bash
git clone https://github.com/sakshamfit/protest.git
cd protest
mkdir -p .github/workflows
git mv workflows-to-add/update.yml workflows-to-add/sync-upstream.yml workflows-to-add/setup-pages.yml .github/workflows/
git rm workflows-to-add/README.md
git commit -m "Enable the self-update workflows"
git push
```

That push switches everything on: `setup-pages.yml` sets Pages to
"Source: GitHub Actions", and `update.yml` immediately fetches the last 7 days of
GDELT protest data and deploys to https://sakshamfit.github.io/protest/.
From then on it refreshes every 30 minutes, and `sync-upstream.yml` pulls in new
commits from AVIVASHISHTA29/india-protest-map every 6 hours.

See `DEPLOYMENT.md` for the optional Vercel half (one secret, two variables).
