// Assembles the static site in _site/ for GitHub Pages:
//   - inlines curated + live data into index.html (no extra requests on first load)
//   - prerenders the latest entries into the list, so crawlers and no-JS readers see content
//   - fills in canonical URLs, JSON-LD and sitemap.xml
//     (no robots.txt: crawlers only read it at the domain root, not under /repo-name/)
//
// Env: SITE_URL (e.g. https://user.github.io/india-protest-map/). Falls back to GITHUB_REPOSITORY.

import fs from "node:fs/promises";

const repo = process.env.GITHUB_REPOSITORY || "";
const [owner, name] = repo.split("/");
let SITE_URL = process.env.SITE_URL || (owner ? `https://${owner.toLowerCase()}.github.io/${name}/` : "http://localhost:3000/");
if (!SITE_URL.endsWith("/")) SITE_URL += "/";

const readJSON = async (p, fb) => { try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return fb; } };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inlineJSON = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
const fmtDate = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const curated = await readJSON("data/curated.json", { events: [] });
const live = await readJSON("data/live.json", { generatedAt: null, clusters: [] });
const now = new Date().toISOString();

// Prerender: recent checked entries, then the best-sourced news detections.
const cutoff = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
const items = [
  ...curated.events.filter((e) => e.ongoing || e.date >= cutoff).map((e) => ({
    title: e.title, place: [e.city, e.venue].filter(Boolean).join(", "), date: e.date, summary: e.summary,
    sources: e.sources || [], tag: e.ongoing ? "Ongoing" : "",
  })),
  ...live.clusters.filter((c) => c.outlets >= 2 && c.title).slice(0, 30).map((c) => ({
    title: c.title, place: c.place, date: c.date, summary: "", sources: (c.urls || []).map((u) => ({ n: new URL(u).hostname.replace(/^www\./, ""), u })), tag: "Auto-detected",
  })),
];
const listHTML = items.map((e) => `<article class="item"><span class="bar"></span><span><h2 class="h">${esc(e.title)}</h2>`
  + `<span class="meta">${esc(e.place)} · <time datetime="${e.date}">${fmtDate(e.date)}</time>${e.tag ? `<span class="tag">${e.tag}</span>` : ""}</span>`
  + (e.summary ? `<span class="detail" style="display:block"><p>${esc(e.summary)}</p></span>` : "")
  + `<span class="meta">${e.sources.filter((s) => /^https?:/.test(s.u)).map((s) => `<a href="${esc(s.u)}" rel="noopener nofollow">${esc(s.n)}</a>`).join(", ")}</span></span></article>`).join("");

const jsonld = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite", "@id": SITE_URL + "#site", url: SITE_URL, name: "India Protest Map", inLanguage: "en-IN",
      description: "A live map of protests, strikes and demonstrations across India, built from news reports.",
    },
    {
      "@type": "Dataset", "@id": SITE_URL + "#data", name: "Protests in India: live news detections",
      description: "Protest events located in India, extracted every 30 minutes from the GDELT 2.0 Event Database and grouped by day and place, plus hand-checked entries with sources.",
      url: SITE_URL, isAccessibleForFree: true, dateModified: live.generatedAt || now,
      spatialCoverage: { "@type": "Place", name: "India" },
      temporalCoverage: `${cutoff}/..`,
      license: "https://creativecommons.org/licenses/by/4.0/",
      creator: { "@type": "Organization", name: "India Protest Map contributors" },
      isBasedOn: "https://www.gdeltproject.org/",
      distribution: [
        { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: SITE_URL + "data/live.json" },
        { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: SITE_URL + "data/curated.json" },
      ],
    },
  ],
};

let html = await fs.readFile("index.html", "utf8");
const replaceOnce = (token, value) => {
  if (!html.includes(token)) throw new Error(`index.html is missing ${token}`);
  html = html.split(token).join(value);
};
replaceOnce("__SITE_URL__", SITE_URL);
replaceOnce("__JSONLD__", inlineJSON(jsonld));
replaceOnce("__BOOT__", inlineJSON({ curated, live }));
replaceOnce("<!--LIST-->", listHTML);

await fs.rm("_site", { recursive: true, force: true });
await fs.mkdir("_site/data", { recursive: true });
await fs.writeFile("_site/index.html", html);
for (const f of ["data/curated.json", "data/live.json", "favicon.svg", "og.png", "apple-touch-icon.png"]) {
  await fs.copyFile(f, `_site/${f}`).catch(() => console.warn(`missing ${f}`));
}
await fs.writeFile("_site/sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
  + `  <url><loc>${SITE_URL}</loc><lastmod>${(live.generatedAt || now).slice(0, 10)}</lastmod><changefreq>hourly</changefreq></url>\n</urlset>\n`);
await fs.writeFile("_site/.nojekyll", "");
// _site is uploaded to Vercel as-is, so its vercel.json keeps the headers but drops the build settings.
const { buildCommand, installCommand, outputDirectory, framework, ...vercel } = await readJSON("vercel.json", {});
await fs.writeFile("_site/vercel.json", JSON.stringify(vercel, null, 2));

const kb = (await fs.stat("_site/index.html")).size / 1024;
console.log(`Built _site for ${SITE_URL} (index.html ${kb.toFixed(0)} KB, ${items.length} prerendered entries)`);
