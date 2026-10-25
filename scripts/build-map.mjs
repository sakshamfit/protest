// One-off: projects data/india-states.geojson (Web Mercator) into SVG path data
// and writes it into index.html between the MAP markers, so the page needs no
// mapping library and no extra request. Re-run only if the boundaries change:
//   node scripts/build-map.mjs
//
// The page's project() function must use the same constants (printed below).

import fs from "node:fs/promises";

const WIDTH = 1000; // projected map width in SVG units
const geo = JSON.parse(await fs.readFile("data/india-states.geojson", "utf8"));

const mx = (lng) => (lng * Math.PI) / 180;
const my = (lat) => -Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

const rings = (g) => (g.type === "Polygon" ? g.coordinates : g.coordinates.flat());
let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
for (const f of geo.features) for (const r of rings(f.geometry)) for (const [lng, lat] of r) {
  x0 = Math.min(x0, mx(lng)); x1 = Math.max(x1, mx(lng));
  y0 = Math.min(y0, my(lat)); y1 = Math.max(y1, my(lat));
}
const k = WIDTH / (x1 - x0);
const H = Math.ceil((y1 - y0) * k);
const r1 = (n) => Math.round(n * 10) / 10;

const paths = geo.features.map((f) => {
  const d = rings(f.geometry).map((r) => {
    let prev = "";
    const pts = [];
    for (const [lng, lat] of r) {
      const p = `${r1((mx(lng) - x0) * k)},${r1((my(lat) - y0) * k)}`;
      if (p !== prev) pts.push(p);
      prev = p;
    }
    return "M" + pts.join("L") + "Z";
  }).join("");
  return `<path class="state" d="${d}"><title>${f.properties.name}</title></path>`;
});

const html = await fs.readFile("index.html", "utf8");
const out = html.replace(/<!--MAP-->[\s\S]*?<!--\/MAP-->/, `<!--MAP-->${paths.join("")}<!--/MAP-->`);
await fs.writeFile("index.html", out);
console.log(JSON.stringify({ k, x0, y0, width: WIDTH, height: H }));
