// Pulls protest events located in India from the GDELT 2.0 Event Database
// (updated every 15 minutes) and writes them to data/live.json.
//
// GDELT codes each news-reported event with CAMEO codes; root code 14 = PROTEST.
// We keep events whose action happened in India (FIPS country code "IN") and
// that GDELT geocoded to at least state level, then group them by day + place.
//
// Two outputs:
//   .cache/gdelt-state.json  full working state (bookmark + clusters with URL slugs).
//                            Persisted between CI runs with actions/cache, never published.
//   data/live.json           the slim file the page loads.
//
// Env vars:
//   WINDOW_DAYS     how many days of events to keep (default 7)
//   BACKFILL_HOURS  on a fresh start, how far back to fetch (default 168 = WINDOW_DAYS)
//   MAX_FILES       max 15-minute files per run (default: enough to cover the backfill)
//   CONCURRENCY     parallel downloads (default 8)
//   GDELT_BASE      override the download base URL (used for local tests)

import fs from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

const WINDOW_DAYS = Number(process.env.WINDOW_DAYS || 7);
const BACKFILL_HOURS = Number(process.env.BACKFILL_HOURS || WINDOW_DAYS * 24);
const MAX_FILES = Number(process.env.MAX_FILES || BACKFILL_HOURS * 4);
const CONCURRENCY = Number(process.env.CONCURRENCY || 8);
const BASE = process.env.GDELT_BASE || "http://data.gdeltproject.org/gdeltv2/";
const STATE = ".cache/gdelt-state.json";
const LIVE = "data/live.json";

// GDELT 2.0 export columns (tab-separated, 61 columns)
const COL = {
  id: 0, sqlDate: 1, eventCode: 26, baseCode: 27, rootCode: 28,
  numSources: 32, numArticles: 33,
  geoType: 51, geoName: 52, geoCountry: 53, geoAdm1: 54, lat: 56, lng: 57,
  dateAdded: 59, url: 60,
};

const MOVEMENT_RULES = [
  ["sir", ["election commission", "election-commission", "cec", "gyanesh", "voter", "voters", "electoral", "sir", "ballot", "vote chori", "evm", "cjp", "cockroach", "dipke"]],
  ["exam", ["exam", "exams", "paper leak", "paperleak", "neet", "ssc", "upsc", "nta", "cuet", "question paper"]],
  ["ladakh", ["ladakh", "leh", "kargil", "sixth schedule", "wangchuk"]],
  ["labour", ["worker", "workers", "wage", "wages", "strike", "union", "unions", "labour", "labor", "farmer", "farmers", "kisan", "msp", "anganwadi", "asha"]],
];
// Words that suggest a URL slug is actually about a protest; used to pick the headline.
const PROTEST_WORDS = ["protest", "protests", "protesters", "protestors", "strike", "march", "rally", "dharna", "agitation", "bandh", "blockade", "gherao", "detained", "detain", "detains", "detention", "detentions", "sit-in", "demonstration", "hunger", "crackdown", "lathicharge", "agitate", "boycott"];

const pad = (n) => String(n).padStart(2, "0");
const toStamp = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
const fromStamp = (s) =>
  new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12)));
const isoDate = (yyyymmdd) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

async function readJSON(path, fallback) {
  try { return JSON.parse(await fs.readFile(path, "utf8")); } catch { return fallback; }
}

async function get(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) { const e = new Error(`${res.status} ${url}`); e.status = res.status; throw e; }
  return res;
}

async function latestStamp() {
  const text = await (await get(BASE + "lastupdate.txt")).text();
  const m = text.match(/(\d{14})\.export\.CSV\.zip/);
  if (!m) throw new Error("Could not read GDELT lastupdate.txt");
  return m[1];
}

function stampsToProcess(latest, lastDone) {
  const out = [];
  const stop = lastDone ? fromStamp(lastDone).getTime() : fromStamp(latest).getTime() - BACKFILL_HOURS * 3600e3;
  for (let t = fromStamp(latest).getTime(); t > stop && out.length < MAX_FILES; t -= 15 * 60e3) {
    out.push(toStamp(new Date(t)));
  }
  return out.reverse(); // oldest first
}

function tokens(url) {
  try {
    const u = new URL(url);
    return decodeURIComponent(u.pathname + " " + u.search).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  } catch { return ""; }
}

function classify(texts) {
  const score = {};
  for (const t of texts) {
    const padded = ` ${t} `;
    for (const [mov, words] of MOVEMENT_RULES) {
      if (words.some((w) => padded.includes(` ${w} `))) score[mov] = (score[mov] || 0) + 1;
    }
  }
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : "other";
}

function titleFromUrl(url) {
  try {
    const segs = new URL(url).pathname.split("/").map((s) => decodeURIComponent(s));
    let best = "";
    for (const s of segs) {
      const words = s
        .replace(/\.(html?|php|aspx?|cms|ece)$/i, "")
        .replace(/(article|story|news)?\d{4,}/gi, " ")
        .split(/[-_+]+/)
        .map((w) => w.replace(/(\D)\d$/, "$1")) // "protest1" -> "protest"
        .filter((w) => /[a-z]/i.test(w) && !/^\d+$/.test(w));
      if (words.length >= 4 && words.join(" ").length > best.length) best = words.join(" ");
    }
    if (!best) return null;
    best = best.replace(/\s+/g, " ").trim();
    if (best.length > 110) best = best.slice(0, 107).replace(/\s\S*$/, "") + "…";
    return best.charAt(0).toUpperCase() + best.slice(1);
  } catch { return null; }
}

// Prefer a headline that mentions protest activity; fall back to the first readable slug.
function pickTitle(urls) {
  const titles = urls.map(titleFromUrl).filter(Boolean);
  const isProtesty = (t) => PROTEST_WORDS.some((w) => ` ${t.toLowerCase()} `.includes(` ${w} `));
  return titles.find(isProtesty) || titles[0] || null;
}

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } };

function addRow(clusters, c, cutoffDate) {
  if (c.length < 61) return;
  if (c[COL.rootCode] !== "14" || c[COL.geoCountry] !== "IN") return;
  const geoType = Number(c[COL.geoType]);
  if (geoType < 2) return; // 1 = country centroid only; not useful on a map
  const lat = Number(c[COL.lat]), lng = Number(c[COL.lng]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const date = isoDate(c[COL.sqlDate]);
  if (date < cutoffDate) return; // GDELT also logs stories about old events

  const key = `${date}|${lat.toFixed(1)}|${lng.toFixed(1)}`;
  const url = c[COL.url];
  const host = hostOf(url);
  let cl = clusters.get(key);
  if (!cl) {
    cl = {
      id: key.replace(/[^0-9a-z]+/gi, "_"), key, date, lat, lng, geoType,
      place: c[COL.geoName].replace(/, India$/, ""),
      articles: 0, codes: {}, urls: [], domains: [], slugs: [],
      firstSeen: c[COL.dateAdded], lastSeen: c[COL.dateAdded],
    };
    clusters.set(key, cl);
  }
  // prefer the most precise location seen for this cluster
  if (geoType > cl.geoType && geoType !== 5) {
    Object.assign(cl, { lat, lng, geoType, place: c[COL.geoName].replace(/, India$/, "") });
  }
  cl.articles += Number(c[COL.numArticles]) || 1;
  const base = c[COL.baseCode].slice(0, 3);
  cl.codes[base] = (cl.codes[base] || 0) + 1;
  if (url && !cl.urls.includes(url) && cl.urls.length < 8) cl.urls.push(url);
  if (host && !cl.domains.includes(host) && cl.domains.length < 40) cl.domains.push(host);
  const tk = tokens(url);
  if (tk && cl.slugs.length < 20 && !cl.slugs.includes(tk)) cl.slugs.push(tk);
  if (c[COL.dateAdded] > cl.lastSeen) cl.lastSeen = c[COL.dateAdded];
}

// GDELT zips hold a single CSV. Read it via the central directory so we need no zip library.
function unzipSingle(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip file");
  const cd = buf.readUInt32LE(eocd + 16);
  const method = buf.readUInt16LE(cd + 10), size = buf.readUInt32LE(cd + 20), local = buf.readUInt32LE(cd + 42);
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(start, start + size);
  return (method === 8 ? inflateRawSync(data) : data).toString("utf8");
}

// Download files in parallel but apply them in order, so the bookmark only
// advances past files we've actually handled.
async function download(stamp) {
  try {
    return unzipSingle(Buffer.from(await (await get(`${BASE}${stamp}.export.CSV.zip`)).arrayBuffer()));
  } catch (e) {
    if (e.status === 404) return ""; // GDELT occasionally skips a slot; nothing to retry
    throw e;
  }
}

async function main() {
  const state = await readJSON(STATE, { lastStamp: null, clusters: [] });

  const cutoff = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
  const clusters = new Map();
  for (const cl of state.clusters || []) {
    if (cl.date >= cutoff && cl.key) clusters.set(cl.key, cl);
  }

  const latest = await latestStamp();
  const todo = stampsToProcess(latest, state.lastStamp);
  console.log(`Latest GDELT file ${latest}; ${todo.length} new file(s) since ${state.lastStamp || "fresh start"}`);

  let processed = 0, lastOk = state.lastStamp;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(download));
    let failed = false;
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      if (r.status === "rejected") {
        console.warn(`Stopping at ${batch[j]}: ${r.reason.message}. Will retry next run.`);
        failed = true; break;
      }
      for (const line of r.value.split("\n")) if (line) addRow(clusters, line.split("\t"), cutoff);
      lastOk = batch[j]; processed++;
    }
    if (failed) break;
  }

  const all = [...clusters.values()].sort((a, b) => b.date.localeCompare(a.date) || b.articles - a.articles).slice(0, 3000);

  await fs.mkdir(".cache", { recursive: true });
  await fs.writeFile(STATE, JSON.stringify({ lastStamp: lastOk, clusters: all }));

  // Slim public file: only what the page renders.
  const pub = all.map((cl) => ({
    id: cl.id, date: cl.date, lat: +cl.lat.toFixed(4), lng: +cl.lng.toFixed(4), geoType: cl.geoType,
    place: cl.place, articles: cl.articles, outlets: cl.domains.length,
    type: Object.entries(cl.codes).sort((a, b) => b[1] - a[1])[0]?.[0] || "140",
    movement: classify(cl.slugs), title: pickTitle(cl.urls), urls: cl.urls.slice(0, 4),
  }));
  await fs.writeFile(LIVE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    lastGdeltFile: lastOk,
    source: "GDELT 2.0 Event Database",
    windowDays: WINDOW_DAYS,
    clusters: pub,
  }));
  console.log(`Processed ${processed} file(s); ${pub.length} clusters in the last ${WINDOW_DAYS} days`);
}

main().catch((e) => { console.error(e); process.exit(1); });
