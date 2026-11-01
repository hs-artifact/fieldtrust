/* FieldTrust web app — vanilla JS + hand-built SVG charts.
   Reads one JSON bundle produced by pipeline/run.py. */
(() => {
"use strict";

// ---------------------------------------------------------------- utilities
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dLabel = iso => { const [, m, d] = String(iso).slice(0, 10).split("-"); return `${+d} ${MON[+m - 1]}`; };
const mLabel = ym => { const [y, m] = ym.split("-"); return `${MON[+m - 1]} ${y}`; };
const fmt = (v, d = 1) => v == null || Number.isNaN(v) ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtInt = v => v == null ? "—" : Math.round(v).toLocaleString("en-US");
const fmtK = v => v == null ? "—" : v >= 1e6 ? fmt(v / 1e6, 2) + "M" : v >= 1e4 ? fmt(v / 1e3, 1) + "k" : fmtInt(v);
const roll7 = a => a.map((_, i) => mean(a.slice(Math.max(0, i - 6), i + 1)));
const mean = a => { const b = a.filter(x => x != null && !Number.isNaN(x)); return b.length ? b.reduce((s, x) => s + x, 0) / b.length : null; };
const sum = a => a.reduce((s, x) => s + (x || 0), 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pretty = s => String(s).replace(/_/g, " ");
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

// ---------------------------------------------------------------- config
const DOMAINS = {
  oil_gas: {
    label: "Oil & Gas",
    tiles: [
      { key: "field_gas_mmscf", label: "Field gas", unit: "MMSCF/d", d: 1, better: null, note: "natural decline" },
      { key: "recon_error_pct", label: "Allocation vs fiscal meter", unit: "% gap", d: 2, better: "down" },
      { key: "well_uptime_pct", label: "Well uptime", unit: "%", d: 1, better: "up" },
      { key: "adoption", label: "Active use of the platform", unit: "%", d: 0, better: "up" },
    ],
  },
  mining: {
    label: "Mining",
    tiles: [
      { key: "tonnage_t", label: "Hauled tonnage", unit: "t/day", d: 0, better: "up", k: true },
      { key: "recon_error_pct", label: "WIM vs FMS gap", unit: "%", d: 2, better: "down" },
      { key: "fatigue_precision_pct", label: "Fatigue alert precision", unit: "%", d: 1, better: "up" },
      { key: "adoption", label: "Active use of the platform", unit: "%", d: 0, better: "up" },
    ],
  },
};
const VIEWS = [
  { id: "overview", label: "Overview", group: "Story", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { id: "value-chain", label: "Value chain", group: "Story", icon: "M2 18h4l3-5h5l3 5h5M6 18V9l3-3M17 18v-6h3M12 13V6" },
  { id: "framework", label: "Framework", group: "Story", icon: "M4 4h16v4H4zM5 10h3v8H5zM10.5 10h3v8h-3zM16 10h3v8h-3zM4 20h16" },
  { id: "case-study", label: "Case study", group: "Story", icon: "M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h6" },
  { id: "pipeline", label: "Data engineering", group: "Data", icon: "M4 6h6v4H4zM14 14h6v4h-6zM10 8h4v8M4 16h6" },
  { id: "quality", label: "Data quality", group: "Data", icon: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7zM8.5 12l2.5 2.5 4.5-5" },
  { id: "governance", label: "Governance", group: "Data", icon: "M4 20h16M6 20V10M10 20V10M14 20V10M18 20V10M3 10l9-6 9 6" },
  { id: "operations", label: "Digital operations", group: "Run & change", icon: "M3 12h4l2-6 4 12 2-6h6" },
  { id: "transformation", label: "Transformation", group: "Run & change", icon: "M4 17l5-5 4 4 7-8M15 8h5v5" },
  { id: "adoption", label: "Change & adoption", group: "Run & change", icon: "M8 11a3 3 0 100-6 3 3 0 000 6zM16 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3 2.5-5 5-5s5 2 5 5M13 15.5c.9-.3 2-.5 3-.5 2.5 0 5 2 5 5" },
  { id: "playbook", label: "Playbook", group: "Run & change", icon: "M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h11M9 8h6" },
];
const STAGES = ["Requirement", "Built", "Factory test", "Field acceptance", "Accepted", "Value realised"];
const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];

const S = { data: null, domain: "oil_gas", view: "overview", sel: {} };
const D = () => S.data.domains[S.domain];

// ---------------------------------------------------------------- derived metrics
function trustBand(v) {
  if (v == null) return { cls: "neutral", label: "No data" };
  if (v >= 90) return { cls: "good", label: "Decision-grade" };
  if (v >= 75) return { cls: "warn", label: "Use with caution" };
  return { cls: "crit", label: "Not decision-grade" };
}
const adBand = v => v >= 75 ? { cls: "good", label: "Embedded" } : v >= 55 ? { cls: "warn", label: "Growing" } : { cls: "crit", label: "Early" };
const first7 = a => mean(a.slice(0, 7));
const last7 = a => mean(a.slice(-7));
function series(key) {
  const d = D();
  if (key === "adoption") return d.adoption.overall;
  if (key === "trust") return d.trust.map(t => t.trust);
  return d.gold.map(g => g[key]);
}
function adoptionNowWas() { const o = D().adoption.overall; return { was: o[0], now: o[o.length - 1] }; }
function totals() {
  const ds = D().datasets;
  return {
    bronze: sum(ds.map(x => x.bronze)), silver: sum(ds.map(x => x.silver)),
    quarantined: sum(ds.map(x => x.quarantined)), flagged: sum(ds.map(x => x.flagged)),
    rules: D().rules.length + 1,
  };
}
function pearson(x, y) {
  const n = x.length, mx = mean(x), my = mean(y);
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < n; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; }
  return a / Math.sqrt(b * c);
}

// ---------------------------------------------------------------- tooltip
const tt = () => $("#tt");
function showTT(html, x, y) {
  const t = tt(); t.innerHTML = html; t.classList.add("on");
  const r = t.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > innerHeight - 8) top = y - r.height - 14;
  t.style.left = Math.max(8, left) + "px"; t.style.top = Math.max(8, top) + "px";
}
const hideTT = () => tt().classList.remove("on");
const ttRow = (name, color, val) => `<div class="row"><span><i style="background:${color}"></i>${esc(name)}</span><b>${val}</b></div>`;
document.addEventListener("pointerover", e => {
  const el = e.target.closest("[data-tt]");
  if (el) showTT(el.getAttribute("data-tt"), e.clientX, e.clientY);
});
document.addEventListener("pointermove", e => {
  const el = e.target.closest("[data-tt]");
  if (el) showTT(el.getAttribute("data-tt"), e.clientX, e.clientY);
});
document.addEventListener("pointerout", e => { if (e.target.closest("[data-tt]")) hideTT(); });

// ---------------------------------------------------------------- charts
function niceTicks(min, max, count = 5) {
  const span = max - min, step0 = span / count, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= count) || mag * 10;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, out = [];
  for (let v = lo; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

function pathFor(values, X, Y, connect) {
  let d = "", pen = false;
  values.forEach((v, i) => {
    if (v == null) { if (!connect) pen = false; return; }
    d += (pen ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1); pen = true;
  });
  return d;
}

function lineChart(host, o) {
  const W = Math.max(280, host.clientWidth || 600), H = o.h || 260;
  const narrow = W < 520;
  const m = { t: o.markers ? 26 : 12, r: o.direct && !narrow ? 132 : 16, b: 28, l: 44 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.x.length;
  const all = o.series.flatMap(s => s.values).filter(v => v != null);
  let lo = o.yMin ?? Math.min(...all), hi = o.yMax ?? Math.max(...all);
  const ticks = o.ticks || niceTicks(lo, hi, 4);
  lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
  const X = i => m.l + (n <= 1 ? iw / 2 : i * iw / (n - 1));
  const Y = v => m.t + ih - (v - lo) / (hi - lo) * ih;
  const fy = o.fmtY || (v => fmt(v, 0));
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || "chart")}">`;
  if (o.band) {
    const y1 = Y(Math.min(o.band.to, hi)), y2 = Y(Math.max(o.band.from, lo));
    s += `<rect x="${m.l}" y="${y1}" width="${iw}" height="${y2 - y1}" style="fill:var(--good-soft)" opacity=".55"/>`;
    s += `<text x="${m.l + 6}" y="${y1 + 13}" style="fill:var(--good)">${esc(o.band.label)}</text>`;
  }
  ticks.forEach(t => {
    s += `<line class="grid-line" x1="${m.l}" x2="${m.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/>`;
    s += `<text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${fy(t)}</text>`;
  });
  const xt = Math.min(narrow ? 4 : 7, n);
  for (let k = 0; k < xt; k++) {
    const i = Math.round(k * (n - 1) / Math.max(1, xt - 1));
    s += `<text x="${X(i)}" y="${H - 8}" text-anchor="${k === 0 ? "start" : k === xt - 1 ? "end" : "middle"}">${esc((o.xFmt || dLabel)(o.x[i]))}</text>`;
  }
  (o.markers || []).forEach(mk => {
    const x = X(mk.i);
    s += `<line x1="${x}" x2="${x}" y1="${m.t - 6}" y2="${m.t + ih}" style="stroke:var(--accent)" stroke-dasharray="3 4" stroke-width="1.2"/>`;
    s += `<circle cx="${x}" cy="${m.t - 13}" r="8" style="fill:var(--surface);stroke:var(--accent)" stroke-width="1.4"/>`;
    s += `<text class="iv-label" x="${x}" y="${m.t - 9.5}" text-anchor="middle">${mk.n}</text>`;
  });
  o.series.forEach((sr, si) => {
    const d = pathFor(sr.values, X, Y, sr.connect);
    if (sr.area) {
      const idx = sr.values.map((v, i) => v == null ? null : i).filter(i => i != null);
      if (idx.length) s += `<path d="${d}L${X(idx[idx.length - 1])},${Y(lo)}L${X(idx[0])},${Y(lo)}Z" style="fill:${sr.color}" opacity=".10"/>`;
    }
    s += `<path class="${o.noAnim ? "" : "draw"}" d="${d}" fill="none" style="stroke:${sr.color}" stroke-width="${sr.width || 2}" stroke-linejoin="round" stroke-linecap="round" ${sr.dash ? `stroke-dasharray="${sr.dash}"` : ""}/>`;
    if (sr.dots) sr.values.forEach((v, i) => { if (v != null) s += `<circle cx="${X(i)}" cy="${Y(v)}" r="3.2" style="fill:${sr.color};stroke:var(--surface)" stroke-width="2"/>`; });
    const li = sr.values.map((v, i) => v == null ? -1 : i).filter(i => i >= 0).pop();
    if (li != null) s += `<circle cx="${X(li)}" cy="${Y(sr.values[li])}" r="4.5" style="fill:${sr.color};stroke:var(--surface)" stroke-width="2"/>`;
  });
  if (o.direct && !narrow) {
    const labs = o.series.filter(sr => !sr.noLabel).map(sr => { const li = sr.values.map((v, i) => v == null ? -1 : i).filter(i => i >= 0).pop(); return { sr, y: Y(sr.values[li]), v: sr.values[li] }; })
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 15) labs[i].y = labs[i - 1].y + 15;
    labs.forEach(l => { s += `<text x="${m.l + iw + 10}" y="${l.y + 4}" style="fill:var(--ink-2);font-family:var(--f-body);font-size:12px">${esc(l.sr.name)} <tspan style="fill:var(--ink);font-weight:600">${(o.fmtV || fy)(l.v)}</tspan></text>`; });
  }
  if (o.cursor != null) s += `<line x1="${X(o.cursor)}" x2="${X(o.cursor)}" y1="${m.t}" y2="${m.t + ih}" style="stroke:var(--ink-2)" stroke-width="1.2"/><circle cx="${X(o.cursor)}" cy="${m.t + ih}" r="3" style="fill:var(--ink-2)"/>`;
  s += `<line class="xh" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" style="stroke:var(--ink-3)" stroke-width="1" opacity="0"/>`;
  o.series.forEach((sr, si) => { s += `<circle class="xd" data-s="${si}" r="4.5" cx="-10" cy="-10" style="fill:${sr.color};stroke:var(--surface)" stroke-width="2" opacity="0"/>`; });
  s += `<rect class="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/>`;
  s += `</svg>`;
  host.innerHTML = s;
  $$("path.draw", host).forEach(p => { try { p.style.setProperty("--len", Math.ceil(p.getTotalLength()) + 1); } catch { p.classList.remove("draw"); } });
  const svg = $("svg", host), hit = $(".hit", host), xh = $(".xh", host), dots = $$(".xd", host);
  const move = e => {
    const r = svg.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (W / r.width);
    const i = clamp(Math.round((mx - m.l) / (iw / Math.max(1, n - 1))), 0, n - 1);
    xh.setAttribute("x1", X(i)); xh.setAttribute("x2", X(i)); xh.setAttribute("opacity", ".5");
    let rows = "";
    o.series.forEach((sr, si) => {
      let v = sr.values[i], j = i;
      if (v == null && sr.connect) { for (let k = 1; k < n; k++) { if (sr.values[i - k] != null) { j = i - k; break; } if (sr.values[i + k] != null) { j = i + k; break; } } v = sr.values[j]; }
      const dot = dots[si];
      if (v != null) { dot.setAttribute("cx", X(j)); dot.setAttribute("cy", Y(v)); dot.setAttribute("opacity", "1"); } else dot.setAttribute("opacity", "0");
      rows += ttRow(sr.name, sr.color, v == null ? "—" : (o.fmtV || fy)(v) + (o.unit || ""));
    });
    const mk = (o.markers || []).find(k => Math.abs(k.i - i) <= 1);
    showTT(`<div class="tt-h">${esc((o.xFmtLong || o.xFmt || dLabel)(o.x[i]))}</div>${rows}${mk ? `<div class="tt-h" style="margin:6px 0 0;color:var(--accent)">${mk.n} · ${esc(mk.label)}</div>` : ""}`, e.clientX, e.clientY);
  };
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => { xh.setAttribute("opacity", "0"); dots.forEach(d => d.setAttribute("opacity", "0")); hideTT(); });
}

function stackBars(host, o) {
  const W = Math.max(280, host.clientWidth || 600), H = o.h || 220;
  const m = { t: 10, r: 10, b: 28, l: 52 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.x.length;
  const tot = o.x.map((_, i) => sum(o.stacks.map(s => s.values[i])));
  const ticks = niceTicks(0, o.yMax ?? Math.max(...tot), 4), hi = ticks[ticks.length - 1];
  const Y = v => m.t + ih - v / hi * ih;
  const bw = iw / n, gap = bw > 6 ? 2 : bw > 3 ? 1 : 0;
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || "bar chart")}">`;
  ticks.forEach(t => { s += `<line class="grid-line" x1="${m.l}" x2="${m.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${(o.fmtY || fmtK)(t)}</text>`; });
  const xt = Math.min(W < 520 ? 4 : 7, n);
  for (let k = 0; k < xt; k++) { const i = Math.round(k * (n - 1) / Math.max(1, xt - 1)); s += `<text x="${m.l + i * bw + bw / 2}" y="${H - 8}" text-anchor="${k === 0 ? "start" : k === xt - 1 ? "end" : "middle"}">${esc((o.xFmt || dLabel)(o.x[i]))}</text>`; }
  o.x.forEach((x, i) => {
    let acc = 0;
    const rows = o.stacks.map(st => ttRow(st.name, st.color, (o.fmtV || fmtInt)(st.values[i]))).join("");
    const tip = esc(`<div class="tt-h">${(o.xFmtLong || o.xFmt || dLabel)(x)}</div>${rows}${o.extra ? o.extra(i) : ""}`);
    s += `<g data-tt="${tip}">`;
    o.stacks.forEach((st, si) => {
      const v = st.values[i] || 0; if (!v) return;
      const y0 = Y(acc), y1 = Y(acc + v); acc += v;
      const hpx = Math.max(0, y0 - y1 - (si > 0 ? 1 : 0));
      s += `<rect x="${m.l + i * bw + gap / 2}" y="${y1}" width="${Math.max(1, bw - gap)}" height="${hpx}" style="fill:${st.color}" rx="1"/>`;
    });
    s += `<rect x="${m.l + i * bw}" y="${m.t}" width="${bw}" height="${ih}" fill="transparent"/></g>`;
  });
  if (o.target != null) {
    s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(o.target)}" y2="${Y(o.target)}" style="stroke:var(--accent)" stroke-dasharray="4 4"/>`;
  }
  s += `<line class="base-line" x1="${m.l}" x2="${m.l + iw}" y1="${Y(0)}" y2="${Y(0)}"/></svg>`;
  host.innerHTML = s;
}

function spark(values, color, w = 120, h = 34, opts = {}) {
  const v = values.map(x => x == null ? null : +x), vals = v.filter(x => x != null);
  if (!vals.length) return "";
  let lo = opts.min ?? Math.min(...vals), hi = opts.max ?? Math.max(...vals);
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const X = i => 2 + i * (w - 6) / Math.max(1, v.length - 1), Y = x => 3 + (h - 6) - (x - lo) / (hi - lo) * (h - 6);
  const d = pathFor(v, X, Y, true);
  const li = v.map((x, i) => x == null ? -1 : i).filter(i => i >= 0).pop();
  const fi = v.findIndex(x => x != null);
  const fluid = opts.fluid !== false;
  return `<svg width="${fluid ? "100%" : w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" style="display:block;max-width:${fluid ? "100%" : w + "px"}">
    <path d="${d}L${X(li)},${h}L${X(fi)},${h}Z" style="fill:${color}" opacity=".12"/>
    <path d="${d}" fill="none" style="stroke:${color}" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    ${fluid ? "" : `<circle cx="${X(li)}" cy="${Y(v[li])}" r="2.8" style="fill:${color};stroke:var(--surface)" stroke-width="1.5"/>`}</svg>`;
}

function gauge(value, was, cap, bandIn, noAnim) {
  const band = bandIn || trustBand(value), r = 52, cx = 70, cy = 66, len = Math.PI * r;
  const p = clamp(value / 100, 0, 1), pw = clamp((was ?? 0) / 100, 0, 1);
  const ang = a => [cx - r * Math.cos(Math.PI * a), cy - r * Math.sin(Math.PI * a)];
  const [wx, wy] = ang(pw);
  const colour = band.cls === "good" ? "var(--good)" : band.cls === "warn" ? "var(--warn)" : "var(--crit)";
  return `<svg viewBox="0 0 140 84" width="100%" style="max-width:180px" role="img" aria-label="${esc(cap)} ${fmt(value, 0)} of 100">
    <path d="M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}" fill="none" style="stroke:var(--line)" stroke-width="9" stroke-linecap="round"/>
    <path class="${noAnim ? "" : "draw"}" d="M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}" fill="none" style="stroke:${colour};--len:${len};stroke-dasharray:${len * p} ${len}" stroke-width="9" stroke-linecap="round"/>
    ${was != null ? `<circle cx="${wx}" cy="${wy}" r="3.4" style="fill:var(--surface);stroke:var(--ink-3)" stroke-width="1.6"><title>Baseline ${fmt(was, 0)}</title></circle>` : ""}
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" style="fill:var(--ink);font:600 32px var(--f-display)">${fmt(value, 0)}</text>
    <text x="${cx}" y="${cy + 12}" text-anchor="middle" style="fill:var(--ink-3);font:400 10px var(--f-mono)">of 100</text></svg>`;
}

function chg(now, was, better, d = 1, unit = "") {
  if (now == null || was == null) return "";
  const diff = now - was, cls = !better || Math.abs(diff) < 1e-9 ? "flat" : (diff > 0) === (better === "up") ? "up" : "down";
  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "■";
  return `<span class="chg ${cls}" title="Change vs first week"><span aria-hidden="true">${arrow}</span>${fmt(Math.abs(diff), d)}${unit}</span>`;
}

function pill(cls, text) { return `<span class="pill ${cls}">${esc(text)}</span>`; }

// ---------------------------------------------------------------- views
function header(eyebrow, title, lede) {
  return `<div><div class="eyebrow">${esc(eyebrow)}</div><h1 class="h1">${esc(title)}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}</div>`;
}
function panelHead(title, sub, right = "") {
  return `<div class="panel-head"><div><h2 class="h2">${esc(title)}</h2>${sub ? `<p class="h2-sub">${sub}</p>` : ""}</div>${right}</div>`;
}
function ivMarkers(scale = 1) {
  return D().interventions.map((iv, k) => ({ i: Math.round(iv.day / scale), n: k + 1, label: iv.title }));
}

const V = {};

V.overview = () => {
  const d = D(), cfg = DOMAINS[S.domain], tr = series("trust"), t = totals(), ad = adoptionNowWas();
  const tiles = cfg.tiles.map(tl => {
    const vals = series(tl.key), now = tl.key === "adoption" ? ad.now : last7(vals), was = tl.key === "adoption" ? ad.was : first7(vals);
    const big = tl.k ? fmtK(now) : `<span data-count="${now}" data-dec="${tl.d}">${fmt(now, tl.d)}</span>`;
    return `<div class="panel tile"><div class="lbl">${esc(tl.label)}</div>
      <div class="big num">${big}<small>${esc(tl.unit)}</small></div>
      <div>${spark(vals, "var(--s1)", 220, 36)}</div>
      <div class="foot"><span>${tl.key === "adoption" ? "weekly, all groups" : "7-day avg vs week 1"}${tl.note ? " · " + esc(tl.note) : ""}</span>${chg(now, was, tl.better, tl.d)}</div></div>`;
  }).join("");
  const moves = d.interventions.map((iv, k) => `<div class="move" data-iv="${iv.day}">
      <div class="move-top"><span class="marker">${k + 1}</span><span class="when">Day ${iv.day} · ${dLabel(d.trust[iv.day].day)}</span><span class="tag-ppt ${esc(iv.type)}">${esc(iv.type)}</span></div>
      <h3>${esc(iv.title)}</h3><p>${esc(iv.detail)}</p></div>`).join("");
  const worst = [...d.rules].filter(r => r.before_pct > 0).sort((a, b) => b.before_pct - a.before_pct).slice(0, 5);
  const maxB = Math.max(...worst.map(r => r.before_pct));
  const worstRows = worst.map(r => `<div style="display:grid;grid-template-columns:72px minmax(0,1fr) 92px;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line-soft)">
      <span class="id">${esc(r.id)}</span>
      <div style="min-width:0"><div style="font-size:12.5px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(r.description)}">${esc(r.description)}</div>
        <div style="position:relative;height:8px;margin-top:6px;background:var(--line-soft);border-radius:4px">
          <div style="position:absolute;inset:0 auto 0 0;width:${r.before_pct / maxB * 100}%;background:var(--s-muted);border-radius:4px"></div>
          <div style="position:absolute;inset:0 auto 0 0;width:${Math.max(0.6, r.after_pct / maxB * 100)}%;background:var(--s1);border-radius:4px"></div></div></div>
      <span class="num" style="text-align:right;font-size:12.5px"><span style="color:var(--ink-3)">${fmt(r.before_pct, 1)}%</span> → <b>${fmt(r.after_pct, 1)}%</b></span></div>`).join("");
  const lastRun = d.ops.runs[d.ops.runs.length - 1];
  const n = d.trust.length;
  const html = `
  <section class="hero">
    <div>
      <div class="eyebrow">Operational data trust platform · ${esc(cfg.label)} pack</div>
      <h1 class="h1">Field data teams can act on, at any hour</h1>
      <p class="lede">${esc(d.site)}: ${esc(d.description)} Over ${S.data.period.days} days, <b class="num">${fmtInt(t.bronze)}</b> raw records were checked against <b>${t.rules}</b> quality rules before reaching a KPI. Fixing data at source lifted trust, and adoption followed.</p>
      <div class="thesis"><b>field reality</b><i>→</i><b>trusted data</b><i>→</i><b>decisions</b><i>→</i><b>adoption</b></div>
      <div class="hero-cta"><button type="button" class="btn primary" data-replay="start"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>Replay the 90 days</button><a class="btn" href="#value-chain">See the value chain</a><a class="btn" href="#framework">See the framework</a></div>
    </div>
    <div class="hero-gauges">
      <div class="gauge-card" id="g-trust"></div>
      <div class="gauge-card" id="g-adopt"></div>
    </div>
  </section>
  <section class="panel flowviz">
    ${panelHead("Live pipeline", `Every record passes the quality rules before it can reach a KPI. Records that break a blocking rule drop into quarantine. <span id="flowDay" class="num"></span>`,
      `<div class="legend"><span><i class="sq" style="background:var(--s1)"></i>Validated</span><span><i class="sq" style="background:var(--s2)"></i>Quarantined</span><span><i class="sq" style="background:var(--accent)"></i>Reaches a KPI</span></div>`)}
    <div class="flow-canvas"><canvas id="flowc" aria-label="Animated view of records flowing from source systems through quality rules to KPIs"></canvas></div>
  </section>
  <section class="grid g-4">${tiles}</section>
  <section class="panel" id="replayPanel">
    ${panelHead("Trust leads, adoption follows", "Data trust score (7-day rolling, daily in grey) and weekly share of target users active on the platform. Press play to watch the 90 days unfold.",
      `<div class="replay"><button type="button" class="rp-btn" id="rpPlay" aria-label="Play the 90-day replay"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg></button>
        <input type="range" id="rpDay" min="0" max="${n - 1}" value="${n - 1}" aria-label="Day of the 90-day period">
        <span class="rp-lbl num" id="rpLbl"></span></div>`)}
    <div class="legend" style="margin:-4px 0 8px"><span><i style="background:var(--s1)"></i>Trust score, 7-day</span><span><i style="background:var(--s-muted)"></i>Daily</span><span><i style="background:var(--s3)"></i>Adoption, % of users</span><span><i class="dash"></i>Intervention</span></div>
    <div class="chart" id="c-hero"></div>
  </section>
  <section class="story">${moves}</section>
  <section class="grid g-2">
    <div class="panel">${panelHead("Where the data broke", "Rule failure rate in the weeks before the first fix, and in the last three weeks.",
      `<div class="legend"><span><i class="sq" style="background:var(--s-muted)"></i>Before</span><span><i class="sq" style="background:var(--s1)"></i>Now</span></div>`)}${worstRows}
      <p class="note" style="margin:10px 0 0">See every rule and its SQL on <a href="#quality">Data quality</a>.</p></div>
    <div class="panel">${panelHead("Pipeline at a glance", `Latest run ${dLabel(lastRun.day)} · ${esc(lastRun.status)}`)}
      <div class="grid g-2" style="gap:14px">
        ${[["Raw records (bronze)", t.bronze], ["Trusted records (silver)", t.silver], ["Quarantined", t.quarantined], ["Promoted with warnings", t.flagged]]
          .map(([l, v]) => `<div class="tile"><div class="lbl">${l}</div><div class="big num" style="font-size:30px"><span data-count="${v}" data-dec="0">${fmtInt(v)}</span></div></div>`).join("")}
      </div>
      <p class="note" style="margin:14px 0 0">A record that breaks a blocking rule never reaches a KPI. It waits in quarantine with the rule IDs it broke, routed to a named data steward. <a href="#pipeline">Open the pipeline</a>.</p></div>
  </section>
  <section class="panel author">
    ${panelHead("Built by Hendro S.", "15+ years across an international oil major, national upstream operators and open-pit coal mining. Balikpapan, Indonesia · open to Indonesia, Malaysia and the Middle East.")}
    <div class="author-grid">
      ${[["Senior Data Engineer, oil & gas", "pipeline", "Contract-driven medallion pipeline, rules as SQL, quarantine, tests gating every deploy"],
         ["Petroleum / Hydrocarbon Data Analyst", "value-chain", "Well test → allocation → fiscal meter, reconciliation tolerance and money at stake"],
         ["Digitalization Manager", "framework", "People, process and technology from one goal tree; adoption tracked against trust"]]
        .map(([r, v, t]) => `<a class="author-role" href="#${v}"><b>${r}</b><span>${t}</span><i>Look here →</i></a>`).join("")}
    </div>
    <div class="author-contact"><a class="btn primary" href="mailto:hendro.sutrisno@outlook.com">hendro.sutrisno@outlook.com</a><a class="btn" href="https://www.linkedin.com/in/hendro-sutrisno-8b4897220" target="_blank" rel="noopener">LinkedIn</a><a class="btn" href="https://github.com/hs-artifact/fieldtrust" target="_blank" rel="noopener">Source on GitHub</a></div>
  </section>`;

  const ad7 = new Array(n).fill(null);
  d.adoption.overall.forEach((v, w) => { const i = Math.min(n - 1, w * 7 + 6); ad7[i] = v; });
  const r7 = roll7(tr);
  const rateAt = i => { const tot = sum(d.datasets.map(x => x.daily[i].total)), q = sum(d.datasets.map(x => x.daily[i].quarantined)); return { tot, q, rate: q / tot }; };
  const setDay = (day, anim) => {
    const cut = a => a.map((v, i) => i <= day ? v : null);
    const tNow = mean(tr.slice(Math.max(0, day - 6), day + 1)), w = Math.min(d.adoption.overall.length - 1, Math.floor(day / 7));
    const aNow = d.adoption.overall[w], tb = trustBand(tNow), ab = adBand(aNow);
    $("#g-trust").innerHTML = `<div class="cap">Data trust score</div>${gauge(tNow, first7(tr), "Data trust score", null, !anim)}<div>${pill(tb.cls, tb.label)}</div><div class="delta">from ${fmt(first7(tr), 0)} in week 1</div>`;
    $("#g-adopt").innerHTML = `<div class="cap">Platform adoption</div>${gauge(aNow, ad.was, "Platform adoption", ab, !anim)}<div>${pill(ab.cls, ab.label)}</div><div class="delta">from ${fmt(ad.was, 0)}% in week 1</div>`;
    lineChart($("#c-hero"), {
      x: d.trust.map(t => t.day), h: 300, yMin: 20, yMax: 100, ticks: [20, 40, 60, 80, 100], band: { from: 90, to: 100, label: "Decision-grade ≥ 90" },
      series: [{ name: "Daily score", color: "var(--s-muted)", values: cut(tr), width: 1.2, noLabel: true },
               { name: "Data trust score", color: "var(--s1)", values: cut(r7), area: true, width: 2.4 },
               { name: "Adoption", color: "var(--s3)", values: cut(ad7), connect: true, dots: true, width: 2.2 }],
      markers: ivMarkers(), direct: true, fmtV: v => fmt(v, 0), label: "Trust score and adoption over 90 days", noAnim: !anim, cursor: day < n - 1 ? day : null,
    });
    $("#rpLbl").textContent = `${dLabel(d.trust[day].day)} · day ${day + 1}`;
    $("#rpDay").value = day;
    $$(".move").forEach(m => m.classList.toggle("off", +m.dataset.iv > day));
    const r = rateAt(day);
    FLOW.rate = r.rate; FLOW.stats = { tot: r.tot, q: r.q, rate: r.rate, trust: tNow };
    $("#flowDay").textContent = `${dLabel(d.trust[day].day)}: ${fmtInt(r.tot)} records, ${fmt(r.rate * 100, 1)}% quarantined.`;
  };
  const after = () => {
    setDay(n - 1, true);
    startFlow($("#flowc"));
    const btn = $("#rpPlay"), slider = $("#rpDay");
    const playIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>`;
    const pauseIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>`;
    const stop = () => { clearInterval(REPLAY.timer); REPLAY.timer = null; btn.innerHTML = playIcon; btn.setAttribute("aria-label", "Play the 90-day replay"); };
    const play = () => {
      let day = +slider.value; if (day >= n - 1) day = 0;
      btn.innerHTML = pauseIcon; btn.setAttribute("aria-label", "Pause the replay");
      setDay(day, false);
      REPLAY.timer = setInterval(() => { day++; setDay(day, false); if (day >= n - 1) stop(); }, 120);
    };
    btn.addEventListener("click", () => REPLAY.timer ? stop() : play());
    slider.addEventListener("input", () => { stop(); setDay(+slider.value, false); });
    REPLAY.play = () => { $("#replayPanel").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }); stop(); slider.value = 0; play(); };
    countUp($("#view"));
  };
  return [html, after];
};

V.pipeline = () => {
  const d = D(), t = totals();
  const dsSel = S.sel.pipeDs || "all";
  const rows = d.datasets.map(ds => `
    <div class="node"><div class="t">${esc(ds.meta.source_system)}</div><div class="s">${esc(ds.meta.grain)}</div></div>
    <div class="arrow">${arrowSvg()}</div>
    <div class="node bronze"><div class="s mono">bronze.${esc(ds.name)}</div><div class="c num">${fmtInt(ds.bronze)}</div></div>
    <div class="arrow">${arrowSvg()}</div>
    <div class="node silver"><div class="s mono">silver.${esc(ds.name)}</div><div class="split"><span class="c num">${fmtInt(ds.silver)}</span><span class="q num" title="Quarantined">${fmtInt(ds.quarantined)} quarantined</span></div>
      <div class="s">${ds.meta.primary_key.map(k => `<span class="chip">${esc(k)}</span>`).join(" ")} · ${(c => c + (c === 1 ? " rule" : " rules"))(d.rules.filter(r => r.dataset === ds.name).length)}</div></div>
    <div class="arrow">${arrowSvg()}</div>`).join("");
  const gold = `<div class="node gold gold-span" style="grid-row:2 / span ${d.datasets.length}"><div class="s mono">gold.gold_daily</div><div class="c num">${d.gold.length} days</div>
    <div class="s" style="margin-top:6px">${d.glossary.length} KPIs, built from silver only</div>
    <div class="s" style="margin-top:8px">${d.glossary.map(g => `<span class="chip" style="margin:2px 2px 0 0;white-space:normal">${esc(g.kpi)}</span>`).join("")}</div></div>`;
  const sel = `<div class="sel" role="group" aria-label="Dataset">${[["all", "All sources"], ...d.datasets.map(ds => [ds.name, pretty(ds.name)])]
    .map(([k, l]) => `<button type="button" data-sel="pipeDs" data-v="${k}" aria-pressed="${dsSel === k}">${esc(l)}</button>`).join("")}</div>`;
  const runs = d.ops.runs.slice(-10).reverse().map(r => `<tr><td class="id">${dLabel(r.day)}</td><td class="n">${fmtInt(r.rows)}</td><td class="n">${fmtInt(r.quarantined)}</td><td class="n">${fmt(r.duration_s, 1)} s</td>
      <td>${pill(r.status === "Succeeded" ? "good" : r.status.startsWith("Recovered") ? "crit" : "warn", r.status)}</td></tr>`).join("");
  const qDs = S.sel.qDs || d.datasets.find(x => x.quarantined > 0).name;
  const samples = d.quarantine_samples[qDs] || [];
  const cols = samples.length ? Object.keys(samples[0]).filter(c => !["day", "lag_minutes", "failed_rules"].includes(c)).slice(0, 7) : [];
  const qSel = `<div class="sel" role="group" aria-label="Quarantine dataset">${d.datasets.filter(x => x.quarantined > 0).map(ds => `<button type="button" data-sel="qDs" data-v="${ds.name}" aria-pressed="${qDs === ds.name}">${esc(pretty(ds.name))}</button>`).join("")}</div>`;
  const r0 = d.rules.find(r => r.severity === "block" && r.dimension === "validity");
  const html = `
  ${header("Data engineering", "Contract-driven medallion pipeline", `Each source lands raw in <b>bronze</b>. Data contracts written in YAML declare owners, freshness and quality rules. Rows that pass are promoted to <b>silver</b>, rows that break a blocking rule are quarantined, and <b>gold</b> KPIs are built from silver only. ${fmtInt(t.bronze)} records, ${t.rules} rules, ${S.data.period.days} daily runs.`)}
  <section class="panel">
    ${panelHead("Data flow", "Counts are totals across the 90-day period.")}
    <div class="flow-wrap"><div class="flow">
      <div class="flow-h">Source system</div><div></div><div class="flow-h"><span class="sw" style="background:#a86b3c"></span>Bronze · raw</div><div></div>
      <div class="flow-h"><span class="sw" style="background:#9aa7ad"></span>Silver · validated</div><div></div><div class="flow-h"><span class="sw" style="background:#d4a72c"></span>Gold · KPIs</div>
      ${rows}
      ${gold}
    </div></div>
  </section>
  <section class="panel">
    ${panelHead("Daily records by outcome", "Clean, promoted with a warning, or quarantined. Hover a bar for the day's numbers.", sel)}
    <div class="legend" style="margin-bottom:10px"><span><i class="sq" style="background:var(--s1)"></i>Clean</span><span><i class="sq" style="background:var(--s4)"></i>Promoted with warning</span><span><i class="sq" style="background:var(--s2)"></i>Quarantined</span></div>
    <div class="chart" id="c-vol"></div>
  </section>
  <section class="grid g-2">
    <div class="panel flush">${panelHead("Run log", "Last 10 scheduled daily runs.")}
      <div class="tbl-wrap"><table><thead><tr><th>Run</th><th class="n">Rows</th><th class="n">Quarantined</th><th class="n">Duration</th><th>Status</th></tr></thead><tbody>${runs}</tbody></table></div></div>
    <div class="panel">${panelHead("Quality rules as code", "One rule from the contract, and the SQL the engine generates from it.")}
      <pre class="code"><span class="c"># governance/contracts/${S.domain}.yml</span>
<span class="k">- id:</span> <span class="a">${esc(r0.id)}</span>
  <span class="k">dimension:</span> <span class="v">${esc(r0.dimension)}</span>
  <span class="k">severity:</span> <span class="v">${esc(r0.severity)}</span>
  <span class="k">description:</span> <span class="v">${esc(r0.description)}</span>
  <span class="k">valid_when:</span> <span class="v">${esc(r0.valid_when)}</span></pre>
      <pre class="code" style="margin-top:10px"><span class="c">-- generated by pipeline/medallion.py</span>
<span class="k">CASE WHEN</span> <span class="v">COALESCE((${esc(r0.valid_when)}), 0)</span>
     <span class="k">THEN</span> 0 <span class="k">ELSE</span> 1 <span class="k">END AS</span> <span class="a">"f_${esc(r0.id)}"</span></pre>
      <p class="note" style="margin:10px 0 0">A NULL never passes a rule by accident: the predicate is wrapped in COALESCE, so unknown counts as a failure.</p></div>
  </section>
  <section class="panel flush">
    ${panelHead("Quarantine sample", "Rows held back from silver, with the rules each one broke.", qSel)}
    <div class="tbl-wrap"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}<th>Failed rules</th></tr></thead>
    <tbody>${samples.map(r => `<tr>${cols.map(c => `<td class="${typeof r[c] === "number" ? "n" : ""} ${c.endsWith("_id") ? "id" : ""}">${r[c] == null ? `<span class="chip" style="color:var(--crit)">NULL</span>` : esc(typeof r[c] === "number" ? fmt(r[c], Number.isInteger(r[c]) ? 0 : 1) : r[c])}</td>`).join("")}
      <td>${String(r.failed_rules).split(" ").map(x => `<span class="chip accent">${esc(x)}</span>`).join(" ")}</td></tr>`).join("")}</tbody></table></div>
  </section>`;
  const after = () => {
    const list = dsSel === "all" ? d.datasets : d.datasets.filter(x => x.name === dsSel);
    const n = list[0].daily.length;
    const clean = [...Array(n)].map((_, i) => sum(list.map(x => x.daily[i].clean)));
    const quar = [...Array(n)].map((_, i) => sum(list.map(x => x.daily[i].quarantined)));
    const tot = [...Array(n)].map((_, i) => sum(list.map(x => x.daily[i].total)));
    const warn = tot.map((v, i) => v - clean[i] - quar[i]);
    stackBars($("#c-vol"), {
      x: list[0].daily.map(x => x.day), h: 230,
      stacks: [{ name: "Clean", color: "var(--s1)", values: clean }, { name: "Warning", color: "var(--s4)", values: warn }, { name: "Quarantined", color: "var(--s2)", values: quar }],
      extra: i => `<div class="row" style="margin-top:4px"><span>Pass rate</span><b>${fmt(clean[i] / tot[i] * 100, 1)}%</b></div>`,
      label: "Daily records by outcome",
    });
  };
  return [html, after];
};
function arrowSvg() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15M14 7l5 5-5 5"/></svg>`; }

V.quality = () => {
  const d = D();
  const dims = Object.keys(d.dimensions);
  const DIM_NOTE = { completeness: "Required values present", validity: "Values inside physical and business limits", uniqueness: "No duplicate records", timeliness: "Data lands inside its freshness SLA", consistency: "Sources reconcile with each other" };
  const cards = dims.map(k => {
    const v = d.dimensions[k], now = last7(v), was = first7(v);
    return `<div class="dim"><div class="lbl">${esc(k)}</div><div class="big num">${fmt(now, 1)}<small style="font:500 14px var(--f-body);color:var(--ink-3)"> %</small></div>
      <div>${spark(v, "var(--s1)", 200, 30)}</div><div class="was">${esc(DIM_NOTE[k] || "")}</div><div>${chg(now, was, "up", 1, " pts")} <span class="was">vs week 1</span></div></div>`;
  }).join("");
  const weeks = Math.floor(d.trust.length / 7);
  const wk = (arr, w) => mean(arr.slice(w * 7, w * 7 + 7));
  const qColor = v => v >= 99 ? "var(--q5)" : v >= 97 ? "var(--q4)" : v >= 93 ? "var(--q3)" : v >= 85 ? "var(--q2)" : "var(--q1)";
  const heat = `<div class="heat" style="grid-template-columns:110px repeat(${weeks}, minmax(22px,1fr));min-width:520px">
    <div></div>${[...Array(weeks)].map((_, w) => `<div class="cl">W${w + 1}</div>`).join("")}
    ${dims.map(k => `<div class="rl">${esc(k)}</div>${[...Array(weeks)].map((_, w) => { const v = wk(d.dimensions[k], w);
      return `<div class="cell" style="background:${qColor(v)}" data-tt="${esc(`<div class="tt-h">Week ${w + 1} · from ${dLabel(d.trust[w * 7].day)}</div>${ttRow(k, qColor(v), fmt(v, 1) + "%")}`)}"></div>`; }).join("")}`).join("")}
  </div>`;
  const scale = `<div class="scale"><span>&lt; 85%</span><span class="bar">${["var(--q1)", "var(--q2)", "var(--q3)", "var(--q4)", "var(--q5)"].map(c => `<i style="background:${c}"></i>`).join("")}</span><span>≥ 99%</span></div>`;
  const rules = d.rules.map(r => {
    const better = r.after_pct < r.before_pct - 0.05, worse = r.after_pct > r.before_pct + 0.05;
    return `<tr><td colspan="7" style="padding:0;border:0"></td></tr><tr>
      <td><details class="rule"><summary style="white-space:nowrap"><span class="caret">▸</span><span class="id">${esc(r.id)}</span></summary><div class="pred"><code class="chip" style="white-space:normal">${esc(r.valid_when)}</code></div></details></td>
      <td>${esc(r.description)}<div class="note mono">${esc(r.dataset)}</div></td>
      <td><span class="chip">${esc(r.dimension)}</span></td>
      <td>${r.severity === "block" ? pill("crit", "Block") : pill("warn", "Warn")}</td>
      <td>${spark(r.weekly, "var(--s2)", 110, 28, { min: 0, fluid: false })}</td>
      <td class="n"><span style="color:var(--ink-3)">${fmt(r.before_pct, 2)}%</span></td>
      <td class="n"><b>${fmt(r.after_pct, 2)}%</b> ${better ? `<span class="chg up">▼</span>` : worse ? `<span class="chg down">▲</span>` : ""}</td></tr>`;
  }).join("");
  const rc = d.reconciliation;
  const html = `
  ${header("Data quality", "Five dimensions, measured every day", "Every rule maps to one quality dimension. Scores are the share of records that pass, so a drop points straight at the rule and the steward who owns it.")}
  <section class="dim-row">${cards}</section>
  <section class="panel">${panelHead("Weekly quality heatmap", "Pass rate per dimension, per week. Hover a cell for the value.", scale)}<div class="tbl-wrap">${heat}</div></section>
  <section class="panel flush">${panelHead("Rule catalogue", `Failure rate before the first fix (days 1–${d.interventions[0].day}) and over the last 21 days. Expand an ID to see its SQL predicate. Reconciliation ${esc(rc.id)}: ${esc(rc.description)}.`)}
    <div class="tbl-wrap"><table><thead><tr><th>Rule</th><th>Checks</th><th>Dimension</th><th>Severity</th><th>Weekly failure trend</th><th class="n">Before</th><th class="n">Now</th></tr></thead><tbody>${rules}</tbody></table></div></section>`;
  return [html, null];
};

V.governance = () => {
  const d = D();
  const cats = d.datasets.map(ds => `<div class="panel cat"><h3>${esc(ds.name)}</h3><div class="src">${esc(ds.meta.source_system)}</div>
    <dl class="kv"><dt>Business owner</dt><dd>${esc(ds.meta.business_owner)}</dd><dt>Data steward</dt><dd>${esc(ds.meta.data_steward)}</dd>
    <dt>Technical owner</dt><dd>${esc(ds.meta.technical_owner)}</dd><dt>Classification</dt><dd><span class="chip">${esc(ds.meta.classification)}</span></dd>
    <dt>Freshness SLA</dt><dd class="num">${ds.meta.freshness_sla_minutes} min</dd><dt>Grain</dt><dd>${esc(ds.meta.grain)}</dd>
    <dt>Columns</dt><dd>${Object.keys(ds.meta.columns).map(c => `<span class="chip" style="margin:0 3px 3px 0" title="${esc(ds.meta.columns[c])}">${esc(c)}</span>`).join("")}</dd></dl></div>`).join("");
  const gl = d.glossary.map(g => `<div style="padding:12px 0;border-bottom:1px solid var(--line-soft)">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>${esc(g.kpi)}</b><span class="chip">${esc(g.unit)}</span></div>
    <div style="color:var(--ink-2);font-size:13px;margin:4px 0 6px">${esc(g.definition)}</div>
    <code class="mono" style="color:var(--ink)">${esc(g.formula)}</code>
    <div class="note" style="margin-top:4px">Owner: ${esc(g.owner)} · Sources: ${g.sources.map(esc).join(", ")}</div></div>`).join("");
  const raci = `<table class="raci"><thead><tr><th>Activity</th>${d.raci.roles.map(r => `<th style="text-align:center;white-space:normal;min-width:76px">${esc(r)}</th>`).join("")}</tr></thead>
    <tbody>${d.raci.activities.map(a => `<tr><td style="min-width:170px">${esc(a.activity)}</td>${a.assign.map(x => `<td class="r"><span class="L ${x}" title="${{ R: "Responsible", A: "Accountable", C: "Consulted", I: "Informed" }[x]}">${x}</span></td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const html = `
  ${header("Data governance", "Every dataset has an owner, a steward and a contract", "Ownership is decided before tooling. The catalogue below is generated from the same YAML contracts the pipeline enforces, so documentation cannot drift from what actually runs.")}
  <section class="grid g-3">${cats}</section>
  <section class="panel">${panelHead("Lineage", "From source system to KPI. Hover a node to trace its path.")}<div class="lineage-wrap" id="lineage"></div></section>
  <section class="grid g-2">
    <div class="panel">${panelHead("KPI glossary", "One definition, one formula, one owner per KPI.")}${gl}</div>
    <div class="panel">${panelHead("RACI", "Who decides, who does the work, who is kept in the loop.", `<div class="legend"><span><span class="L A" style="width:18px;height:18px;display:inline-grid;place-items:center;border-radius:4px;font:600 10px var(--f-mono)">A</span>Accountable</span><span><span class="L R" style="width:18px;height:18px;display:inline-grid;place-items:center;border-radius:4px;font:600 10px var(--f-mono)">R</span>Responsible</span></div>`)}<div class="tbl-wrap">${raci}</div>
      <p class="note" style="margin:12px 0 0">Exactly one A per row. When a rule fails, the steward is notified by name rather than a shared mailbox.</p></div>
  </section>`;
  return [html, () => drawLineage($("#lineage"), d.lineage)];
};

function drawLineage(host, lin) {
  const layers = ["source", "bronze", "silver", "gold", "kpi"], names = { source: "Source", bronze: "Bronze", silver: "Silver", gold: "Gold", kpi: "KPI" };
  const W = Math.max(900, host.clientWidth), colW = (W - 40) / layers.length, nodeW = colW - 34, nodeH = 30, gapY = 12;
  const byL = layers.map(l => lin.nodes.filter(n => n.layer === l));
  const H = Math.max(...byL.map(a => a.length)) * (nodeH + gapY) + 40;
  const pos = {};
  byL.forEach((arr, li) => { const total = arr.length * (nodeH + gapY) - gapY, y0 = 30 + (H - 30 - total) / 2; arr.forEach((n, k) => { pos[n.id] = { x: 20 + li * colW, y: y0 + k * (nodeH + gapY), n }; }); });
  const colour = { source: "var(--ink-3)", bronze: "#a86b3c", silver: "#9aa7ad", gold: "#d4a72c", kpi: "var(--accent)" };
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Data lineage from source to KPI">`;
  layers.forEach((l, li) => { s += `<text x="${20 + li * colW}" y="14" style="fill:var(--ink-3);letter-spacing:.1em">${names[l].toUpperCase()}</text>`; });
  lin.edges.forEach(e => { const a = pos[e.source], b = pos[e.target]; if (!a || !b) return;
    const x1 = a.x + nodeW, y1 = a.y + nodeH / 2, x2 = b.x, y2 = b.y + nodeH / 2, mx = (x1 + x2) / 2;
    s += `<path class="edge" data-a="${esc(e.source)}" data-b="${esc(e.target)}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" style="stroke:var(--line)" stroke-width="1.4"/>`; });
  Object.values(pos).forEach(p => {
    const maxC = Math.floor((nodeW - 20) / 6.9), label = p.n.label.length > maxC ? p.n.label.slice(0, maxC - 1) + "…" : p.n.label;
    s += `<g class="lnode" data-id="${esc(p.n.id)}" style="cursor:default"><title>${esc(p.n.label)}</title><rect x="${p.x}" y="${p.y}" width="${nodeW}" height="${nodeH}" rx="6" style="fill:var(--surface-2);stroke:var(--line)"/>
      <rect x="${p.x}" y="${p.y}" width="3" height="${nodeH}" rx="1.5" style="fill:${colour[p.n.layer]}"/>
      <text x="${p.x + 12}" y="${p.y + 19}" style="fill:var(--ink)">${esc(label)}</text></g>`;
  });
  host.innerHTML = s + "</svg>";
  const edges = $$(".edge", host);
  const trace = id => {
    const up = new Set([id]), down = new Set([id]);
    let changed = true; while (changed) { changed = false; lin.edges.forEach(e => { if (down.has(e.source) && !down.has(e.target)) { down.add(e.target); changed = true; } if (up.has(e.target) && !up.has(e.source)) { up.add(e.source); changed = true; } }); }
    const on = new Set([...up, ...down]);
    edges.forEach(p => { const hit = on.has(p.dataset.a) && on.has(p.dataset.b); p.style.stroke = hit ? "var(--accent)" : "var(--line)"; p.style.opacity = hit ? 1 : .35; });
    $$(".lnode", host).forEach(g => { g.style.opacity = on.has(g.dataset.id) ? 1 : .35; });
  };
  $$(".lnode", host).forEach(g => { g.addEventListener("pointerenter", () => trace(g.dataset.id)); g.addEventListener("pointerleave", () => { edges.forEach(p => { p.style.stroke = ""; p.style.opacity = 1; }); $$(".lnode", host).forEach(x => x.style.opacity = 1); }); });
}

V.operations = () => {
  const d = D(), o = d.ops, last = o.sla[o.sla.length - 1];
  const open = o.incidents.filter(i => i.status !== "Resolved").length;
  const tile = (l, v, u, foot) => `<div class="panel tile"><div class="lbl">${l}</div><div class="big num">${v}<small>${u}</small></div><div class="foot"><span>${foot}</span></div></div>`;
  const sevCls = s => s === "P1" ? "crit" : s === "P2" ? "warn" : "neutral";
  const inc = [...o.incidents].reverse().map(i => `<tr><td class="id">${esc(i.id)}</td><td class="id">${dLabel(i.day)}</td><td>${pill(sevCls(i.severity), i.severity)}</td>
     <td>${esc(i.title)}<div class="note">${esc(i.kind)} · detected by ${esc(i.detected_by)}</div></td><td class="mono">${esc(pretty(i.source))}</td>
     <td class="n">${fmt(i.mttr_h, 1)} h</td><td>${pill(i.status === "Resolved" ? "good" : "warn", i.status)}</td></tr>`).join("");
  const cellC = v => v >= 99.5 ? "var(--surface-2)" : v >= 98 ? "var(--warn)" : "var(--crit)";
  const n = d.trust.length;
  const strip = `<div class="heat" style="grid-template-columns:170px repeat(${n}, minmax(4px,1fr));gap:2px;min-width:640px">
    ${o.sources.map(s => `<div class="rl">${esc(pretty(s))}</div>${o.availability[s].map((v, i) => `<div class="cell" style="height:22px;border-radius:2px;background:${cellC(v)}" data-tt="${esc(`<div class="tt-h">${dLabel(d.trust[i].day)}</div>${ttRow(pretty(s), cellC(v), fmt(v, 2) + "%")}`)}"></div>`).join("")}`).join("")}
  </div>`;
  const html = `
  ${header("Digital operations", "Run it 24×7, measure it, improve it", `Every source and the pipeline itself are watched by heartbeat and freshness monitors. The rule engine raises its own incidents when quarantine rates spike, so a data problem is treated like an outage. Target availability ${o.sla_target}%.`)}
  <section class="grid g-4">
    ${tile("Availability, " + mLabel(last.month), fmt(last.availability, 2), "%", `target ${o.sla_target}%`)}
    ${tile("Mean time to restore", fmt(o.mttr_after, 1), "h", `from ${fmt(o.mttr_before, 1)} h before the first fix`)}
    ${tile("Incidents, 90 days", o.incidents.length, "", `${o.incidents.filter(i => i.kind === "Data quality breach").length} raised by the rule engine`)}
    ${tile("Open", open, "", open ? "in monitoring after fix" : "none")}
  </section>
  <section class="grid g-21">
    <div class="panel">${panelHead("Availability by month", "Average across all sources and the pipeline. Dashed line is the SLA target.", `<div class="legend"><span><i class="sq" style="background:var(--s1)"></i>Availability</span><span><i class="dash"></i>${o.sla_target}% target</span></div>`)}<div class="chart" id="c-sla"></div></div>
    <div class="panel">${panelHead("Runbook: rule-engine incident", "First 30 minutes on any shift.")}
      <ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:8px;color:var(--ink-2);font-size:13px">
        <li>Check the quarantine sample for the failing rule ID and the affected source.</li>
        <li>Confirm with the control room whether the field condition is real (shut-in, weather, maintenance).</li>
        <li>If the data is wrong, page the named steward; do not patch values downstream.</li>
        <li>If a KPI is affected, mark it <i>Use with caution</i> on the shift report.</li>
        <li>Close only after the source is fixed and one clean run is confirmed.</li>
      </ol></div>
  </section>
  <section class="panel">${panelHead("Source availability, daily", "Each cell is one day. Hover for the figure.", `<div class="legend"><span><i class="sq" style="background:var(--surface-2);box-shadow:0 0 0 1px var(--line)"></i>≥ 99.5%</span><span><i class="sq" style="background:var(--warn)"></i>98–99.5%</span><span><i class="sq" style="background:var(--crit)"></i>&lt; 98%</span></div>`)}<div class="tbl-wrap">${strip}</div></section>
  <section class="panel flush">${panelHead("Incident log", "Newest first. Severity P1 (site-wide) to P4 (single asset).")}
    <div class="tbl-wrap"><table><thead><tr><th>ID</th><th>Date</th><th>Sev.</th><th>Incident</th><th>Source</th><th class="n">Restore</th><th>Status</th></tr></thead><tbody>${inc}</tbody></table></div></section>`;
  const after = () => {
    const host = $("#c-sla"), W = Math.max(280, host.clientWidth), H = 220, m = { t: 14, r: 12, b: 28, l: 44 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const lo = 96, hi = 100, Y = v => m.t + ih - (v - lo) / (hi - lo) * ih, bw = Math.min(90, iw / o.sla.length * 0.5);
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly availability against target">`;
    [96, 97, 98, 99, 100].forEach(t => { s += `<line class="grid-line" x1="${m.l}" x2="${m.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${t}%</text>`; });
    o.sla.forEach((r, i) => { const cx = m.l + (i + 0.5) * iw / o.sla.length;
      s += `<g data-tt="${esc(`<div class="tt-h">${mLabel(r.month)}</div>${ttRow("Availability", "var(--s1)", fmt(r.availability, 2) + "%")}`)}"><rect x="${cx - bw / 2}" y="${Y(r.availability)}" width="${bw}" height="${Y(lo) - Y(r.availability)}" rx="4" style="fill:var(--s1)"/>
        <text x="${cx}" y="${Y(r.availability) - 6}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${fmt(r.availability, 2)}%</text>
        <text x="${cx}" y="${H - 8}" text-anchor="middle">${mLabel(r.month)}</text></g>`; });
    s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(o.sla_target)}" y2="${Y(o.sla_target)}" style="stroke:var(--accent)" stroke-dasharray="5 4" stroke-width="1.5"/>`;
    s += `<text x="${m.l + iw}" y="${m.t + 4}" text-anchor="end" style="fill:var(--ink-3)">axis starts at 96%</text></svg>`;
    host.innerHTML = s;
  };
  return [html, after];
};

V.transformation = () => {
  const d = D(), items = d.transformation;
  const counts = STAGES.map((_, k) => items.filter(i => i.stage === k).length);
  const list = items.map(it => {
    const fillW = it.stage / 5 * 83.34;
    return `<div class="tr-item">
      <div><span class="chip">${esc(it.id)}</span> ${it.stage === 5 ? pill("good", "Value realised") : it.stage >= 4 ? pill("good", "Accepted") : it.stage === 3 ? pill("warn", "In field acceptance") : pill("neutral", STAGES[it.stage])}
        <h3>${esc(it.capability)}</h3><p>${esc(it.requirement)}</p></div>
      <div><div class="stages">${STAGES.map(s => `<div>${esc(s)}</div>`).join("")}</div>
        <div class="track"><div class="fill" style="width:${fillW}%"></div>${STAGES.map((_, k) => `<span class="st ${k < it.stage ? "done" : k === it.stage ? "now done" : ""}" title="${esc(STAGES[k])}"></span>`).join("")}</div>
        <dl class="kv"><dt>Acceptance</dt><dd>${esc(it.acceptance)}</dd><dt>Evidence</dt><dd>${esc(it.evidence)}</dd><dt>Value</dt><dd><b>${esc(it.value)}</b></dd></dl></div></div>`;
  }).join("");
  const html = `
  ${header("Digital transformation", "Requirement → acceptance → evidence", "A capability counts as delivered when the field accepts it against criteria agreed up front, with evidence anyone can check. Installing the system is only the start. Value is recorded only after it shows up in operations.")}
  <section class="grid g-3">
    ${[["Value realised", counts[5], "good"], ["Accepted, value tracking", counts[4], "good"], ["In build or field test", counts[1] + counts[2] + counts[3] + counts[0], "warn"]]
      .map(([l, v, c]) => `<div class="panel tile"><div class="lbl">${l}</div><div class="big num">${v}<small>of ${items.length}</small></div></div>`).join("")}
  </section>
  <section class="panel flush">${panelHead("Capability tracker", "Stage gates for each capability in this domain pack.")}${list}</section>`;
  return [html, null];
};

V.adoption = () => {
  const d = D(), a = d.adoption, groups = Object.keys(a.groups);
  const lagX = a.trust_weekly.slice(0, -2), lagY = a.overall.slice(2);
  const r = pearson(lagX, lagY);
  const quad = (p, i) => p >= 6 && i >= 6 ? "Manage closely" : p >= 6 ? "Keep satisfied" : i >= 6 ? "Keep informed" : "Monitor";
  const pts = d.change.stakeholders.map(s => `<div class="pt" style="left:${(s.interest - 0.5) / 10 * 100}%;bottom:${(s.power - 0.5) / 10 * 100}%" data-tt="${esc(`<div class="tt-h">${s.group}</div>${ttRow("Power", "var(--ink-3)", s.power + " / 10")}${ttRow("Interest", "var(--ink-3)", s.interest + " / 10")}<div class="tt-h" style="margin:6px 0 0;color:var(--accent)">${quad(s.power, s.interest)}</div>`)}"><i></i>${esc(s.group)}</div>`).join("");
  const ad = d.change.adkar, letters = ["Awareness", "Desire", "Knowledge", "Ability", "Reinforcement"];
  const cell = v => `background:${["var(--q1)", "var(--q2)", "var(--q3)", "var(--q4)", "var(--q5)"][v - 1]};color:${v >= 4 ? "var(--bg)" : "var(--ink)"}`;
  const adkar = `<table class="adkar"><thead><tr><th>Group</th>${letters.map(l => `<th style="text-align:center" title="${l}">${l[0]}<span style="text-transform:none;letter-spacing:0" class="lbl-long">${l.slice(1)}</span></th>`).join("")}</tr></thead>
    <tbody>${d.change.adkar_groups.map(g => `<tr><td style="white-space:nowrap">${esc(g)}</td>${ad.current[g].map((v, k) => `<td class="c"><span class="cellv" style="${cell(v)}" data-tt="${esc(`<div class="tt-h">${g} · ${letters[k]}</div>${ttRow("Baseline", "var(--ink-3)", ad.baseline[g][k] + " / 5")}${ttRow("Now", "var(--s1)", v + " / 5")}`)}">${ad.baseline[g][k]}→${v}</span></td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const html = `
  ${header("Change & adoption", "People adopt data they trust", `Adoption is tracked per user group as the weekly share of target users acting on the platform. Across the period, adoption tracks the trust score from two weeks earlier with a correlation of <b class="num">r = ${fmt(r, 2)}</b>. The lesson from the field: fix the data first, then ask people to change how they work.`)}
  <section class="panel">${panelHead("Weekly adoption by user group", "Share of target users active each week. Markers show interventions.", `<div class="legend">${groups.map((g, i) => `<span><i style="background:${SERIES[i]}"></i>${esc(g)}</span>`).join("")}</div>`)}<div class="chart" id="c-adopt"></div></section>
  <section class="grid g-12">
    <div class="panel">${panelHead("Trust → adoption", "Each dot is one week: trust score two weeks earlier against adoption.")}<div class="chart" id="c-scatter"></div></div>
    <div class="panel">${panelHead("ADKAR by group", "Score out of 5, baseline → now. Hover for detail. The weakest letter decides the next action.", `<div class="scale"><span>1</span><span class="bar">${["var(--q1)", "var(--q2)", "var(--q3)", "var(--q4)", "var(--q5)"].map(c => `<i style="background:${c}"></i>`).join("")}</span><span>5</span></div>`)}<div class="tbl-wrap">${adkar}</div>
      <p class="note" style="margin:12px 0 0">Reinforcement was the gap everywhere at baseline. It moved once the trust score was visible on shift reports and supervisors began referring to it in toolbox talks.</p></div>
  </section>
  <section class="grid g-2">
    <div class="panel">${panelHead("Stakeholder map", "Power against interest decides how each group is engaged.")}
      <div style="display:grid;grid-template-columns:20px minmax(0,1fr);gap:6px;align-items:stretch">
        <div style="writing-mode:vertical-rl;transform:rotate(180deg);font:500 10.5px var(--f-mono);letter-spacing:.1em;color:var(--ink-3);text-align:center">POWER →</div>
        <div><div class="pi"><div class="q">Keep satisfied</div><div class="q hot">Manage closely</div><div class="q">Monitor</div><div class="q">Keep informed</div>${pts}</div>
          <div style="font:500 10.5px var(--f-mono);letter-spacing:.1em;color:var(--ink-3);text-align:center;margin-top:6px">INTEREST →</div></div></div></div>
    <div class="panel">${panelHead("How each group was engaged", "")}
      ${d.change.stakeholders.map(s => `<div style="display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line-soft);font-size:13px"><span>${esc(s.group)}</span><span class="chip ${quad(s.power, s.interest) === "Manage closely" ? "accent" : ""}">${quad(s.power, s.interest)}</span></div>`).join("")}
      <p class="note" style="margin:12px 0 0">Pain points were gathered with operators, shift crews and site leadership before any solution was chosen.</p></div>
  </section>`;
  const after = () => {
    lineChart($("#c-adopt"), {
      x: a.weeks, h: 300, yMin: 20, yMax: 100, ticks: [20, 40, 60, 80, 100],
      xFmt: w => dLabel(w), xFmtLong: w => "Week of " + dLabel(w),
      series: groups.map((g, i) => ({ name: g, color: SERIES[i], values: a.groups[g], dots: true })),
      markers: ivMarkers(7), direct: true, unit: "%", fmtV: v => fmt(v, 0), label: "Weekly adoption by group",
    });
    const host = $("#c-scatter"), W = Math.max(260, host.clientWidth), H = 280, m = { t: 12, r: 14, b: 40, l: 44 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x0 = Math.floor(Math.min(...lagX) / 10) * 10, x1 = 100, y0 = Math.floor(Math.min(...lagY) / 10) * 10, y1 = 100;
    const X = v => m.l + (v - x0) / (x1 - x0) * iw, Y = v => m.t + ih - (v - y0) / (y1 - y0) * ih;
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Trust versus adoption scatter">`;
    niceTicks(y0, y1, 4).forEach(t => { s += `<line class="grid-line" x1="${m.l}" x2="${m.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${t}%</text>`; });
    niceTicks(x0, x1, 4).forEach(t => { s += `<text x="${X(t)}" y="${H - 22}" text-anchor="middle">${t}</text>`; });
    s += `<text x="${m.l + iw / 2}" y="${H - 4}" text-anchor="middle">Trust score, 2 weeks earlier</text>`;
    const n = lagX.length, mx = mean(lagX), my = mean(lagY);
    let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (lagX[i] - mx) * (lagY[i] - my); den += (lagX[i] - mx) ** 2; }
    const b = num / den, c = my - b * mx, xa = Math.min(...lagX), xb = Math.max(...lagX);
    s += `<line x1="${X(xa)}" y1="${Y(b * xa + c)}" x2="${X(xb)}" y2="${Y(b * xb + c)}" style="stroke:var(--ink-3)" stroke-dasharray="4 4"/>`;
    lagX.forEach((v, i) => { s += `<circle cx="${X(v)}" cy="${Y(lagY[i])}" r="6" style="fill:var(--s1);stroke:var(--surface)" stroke-width="2" data-tt="${esc(`<div class="tt-h">Week ${i + 3}</div>${ttRow("Trust (wk " + (i + 1) + ")", "var(--s1)", fmt(v, 1))}${ttRow("Adoption", "var(--s3)", fmt(lagY[i], 1) + "%")}`)}"/>`; });
    s += `<text x="${m.l + 8}" y="${m.t + 14}" style="fill:var(--ink);font-weight:600">r = ${fmt(r, 2)}</text></svg>`;
    host.innerHTML = s;
  };
  return [html, after];
};

V["case-study"] = () => {
  const og = S.data.domains.oil_gas, mn = S.data.domains.mining;
  const tw = dd => [first7(dd.trust.map(t => t.trust)), last7(dd.trust.map(t => t.trust))];
  const [ogA, ogB] = tw(og), [mnA, mnB] = tw(mn);
  const ruleH03 = og.rules.find(r => r.id === "OG-H-03"), wimA = first7(mn.gold.map(g => g.recon_error_pct)), wimB = last7(mn.gold.map(g => g.recon_error_pct));
  const precA = mean(mn.gold.slice(0, 40).map(g => g.fatigue_precision_pct)), precB = last7(mn.gold.map(g => g.fatigue_precision_pct));
  const html = `
  <section class="hero" style="grid-template-columns:1fr">
    <div><div class="eyebrow">Case study · Hendro S. · hs-artifact</div>
      <p class="quote" style="margin-top:12px">“If it doesn’t work at 3 AM on night shift, <span>it doesn’t work.</span>”</p>
      <p class="lede">Most digital programmes in heavy industry fail on untrusted data, unclear ownership and systems that never get accepted on site, rarely on technology. FieldTrust is a working model of how I close that gap: data engineering, governance, operations and change management in one product, applied to an oil &amp; gas field and an open-pit mine.</p></div>
  </section>
  <section class="cs">
    <div><div class="eyebrow">Problem</div><h3>Numbers nobody trusted</h3><ul>
      <li>Pressure tags on four wells exported in bar, not psi: <b>${fmt(ruleH03.before_pct, 0)}%</b> of historian rows broke the physical envelope.</li>
      <li>Weigh-in-motion read about <b>${fmt(wimA, 1)}%</b> heavier than on-board payload, so tonnage could not be reported.</li>
      <li>Fatigue alarms were right only <b>${fmt(precA, 0)}%</b> of the time, and crews learned to ignore them.</li></ul></div>
    <div><div class="eyebrow">Approach</div><h3>Fix it at source, then prove it</h3><ul>
      <li>Data contracts with a named owner and steward for every dataset.</li>
      <li>Rule engine that quarantines bad rows and raises its own incidents.</li>
      <li>Requirement → acceptance → evidence for each capability, signed in the field.</li>
      <li>ADKAR and stakeholder mapping per user group, before training starts.</li></ul></div>
    <div><div class="eyebrow">Outcome</div><h3>Decision-grade data, used on shift</h3><ul>
      <li>Trust score <b>${fmt(ogA, 0)} → ${fmt(ogB, 0)}</b> (oil &amp; gas) and <b>${fmt(mnA, 0)} → ${fmt(mnB, 0)}</b> (mining).</li>
      <li>WIM gap <b>${fmt(wimA, 1)}% → ${fmt(wimB, 1)}%</b>, inside the 2% accuracy target.</li>
      <li>Fatigue alert precision <b>${fmt(precA, 0)}% → ${fmt(precB, 0)}%</b>.</li>
      <li>Adoption <b>${fmt(og.adoption.overall[0], 0)}% → ${fmt(og.adoption.overall.at(-1), 0)}%</b> and <b>${fmt(mn.adoption.overall[0], 0)}% → ${fmt(mn.adoption.overall.at(-1), 0)}%</b>.</li></ul></div>
  </section>
  <section class="grid g-2">
    <div class="panel">${panelHead("What each part demonstrates", "")}
      ${[["The framework", "framework", "People, process and technology from one goal tree, grounded in data"],
         ["Playbook", "playbook", "Normal and edge cases with root cause and resolution"],
         ["Data engineering", "pipeline", "Medallion pipeline, contract-driven rules, quarantine, reproducible runs"],
         ["Data governance", "governance", "Ownership, stewardship, KPI glossary, RACI, lineage"],
         ["Data quality", "quality", "Five dimensions, rule catalogue, before/after evidence"],
         ["Digital operations", "operations", "24×7 monitoring, SLA, incidents, MTTR, runbook"],
         ["Digital transformation", "transformation", "Stage gates from requirement to value realised"],
         ["Change management", "adoption", "ADKAR, stakeholder map, adoption linked to trust"]]
        .map(([t, h, s]) => `<a href="#${h}" style="display:grid;grid-template-columns:180px minmax(0,1fr);gap:12px;padding:10px 0;border-bottom:1px solid var(--line-soft);text-decoration:none"><b>${t} <span style="color:var(--accent)">→</span></b><span style="color:var(--ink-2);font-size:13px">${s}</span></a>`).join("")}</div>
    <div class="panel">${panelHead("How it is built", "")}
      <div class="stack" style="margin-bottom:14px">${["Python", "pandas", "SQL (SQLite, Postgres-ready)", "YAML data contracts", "Vanilla JS + SVG", "GitHub Pages"].map(x => `<span class="chip">${x}</span>`).join("")}</div>
      <pre class="code">fieldtrust/
├─ governance/
│  ├─ contracts/     <span class="c"># owners, SLAs, quality rules (YAML)</span>
│  └─ programme/     <span class="c"># glossary, RACI, stage gates, ADKAR</span>
├─ pipeline/
│  ├─ generate.py    <span class="c"># synthetic source systems</span>
│  ├─ medallion.py   <span class="c"># bronze → silver → gold, rule engine</span>
│  ├─ sql/           <span class="c"># staging + gold SQL</span>
│  └─ run.py         <span class="c"># scoring, ops, publish JSON</span>
└─ app/              <span class="c"># this web app</span></pre>
      <p class="note" style="margin:12px 0 0">The domain model, quality rules, acceptance criteria and adoption logic come from my work in upstream oil &amp; gas and open-pit mining. The code was built with AI-assisted development. All sites, people and figures are fictional, and the data is synthetic.</p></div>
  </section>`;
  return [html, null];
};

// ---------------------------------------------------------------- motion helpers
const REDUCED = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const REPLAY = { timer: null, play: null };
const FLOW = { raf: 0, rate: 0.05, parts: [], canvas: null };

function countUp(root) {
  if (REDUCED()) return;
  $$("[data-count]", root).forEach(el => {
    const to = +el.dataset.count, dec = +el.dataset.dec || 0, t0 = performance.now(), dur = 900;
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = dec ? fmt(to * e, dec) : fmtInt(to * e);
      if (p < 1) requestAnimationFrame(step); else el.textContent = dec ? fmt(to, dec) : fmtInt(to);
    };
    requestAnimationFrame(step);
  });
}

function stopFlow() { cancelAnimationFrame(FLOW.raf); FLOW.raf = 0; FLOW.parts = []; }

function startFlow(canvas) {
  stopFlow();
  if (!canvas) return;
  FLOW.canvas = canvas;
  const ctx = canvas.getContext("2d");
  const cs = () => getComputedStyle(document.documentElement);
  let col = {}, W = 0, H = 0, dpr = 1, frame = 0;
  const readCols = () => { const s = cs(); col = { s1: s.getPropertyValue("--s1").trim(), s2: s.getPropertyValue("--s2").trim(), ac: s.getPropertyValue("--accent").trim(), ink: s.getPropertyValue("--ink").trim(), ink3: s.getPropertyValue("--ink-3").trim(), line: s.getPropertyValue("--line").trim(), sf: s.getPropertyValue("--surface-2").trim() }; };
  const size = () => { dpr = Math.min(2, devicePixelRatio || 1); W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  readCols(); size();
  const narrow = () => W < 560;
  let NODES = null;
  const node = () => { if (!NODES || NODES.W !== W || NODES.H !== H) { NODES = computeNode(); NODES.W = W; NODES.H = H; } return NODES; };
  const computeNode = () => {
    const y = H * 0.40, srcX = narrow() ? 26 : 112;
    return {
      src: [0, 1, 2].map(k => ({ x: srcX, y: y + (k - 1) * (narrow() ? 26 : 34) })),
      bronze: { x: W * (narrow() ? 0.27 : 0.30), y }, rules: { x: W * (narrow() ? 0.5 : 0.52), y }, silver: { x: W * 0.72, y }, gold: { x: W - (narrow() ? 30 : 80), y }, quar: { x: W * (narrow() ? 0.5 : 0.52), y: H * 0.86 },
    };
  };
  const SHORT = { historian_well_hourly: "Historian", daily_production_report: "Daily report", fiscal_meter_daily: "Fiscal meter", fms_haul_cycles: "FMS cycles", wim_tickets: "Weighbridge", fatigue_alerts: "Fatigue alerts" };
  const names = () => D().datasets.map(x => SHORT[x.name] || x.name);
  const spawn = () => {
    const N = node(), k = Math.floor(Math.random() * 3), s = N.src[k];
    FLOW.parts.push({ x: s.x, y: s.y, path: [N.bronze, N.rules], seg: 0, sp: 1.4 + Math.random() * 0.9, kind: "ok", life: 0, jitter: (Math.random() - 0.5) * 10 });
  };
  const label = (txt, x, y, align = "center", c = col.ink3, size = 10.5) => { ctx.fillStyle = c; ctx.font = `500 ${size}px "IBM Plex Mono", ui-monospace, monospace`; ctx.textAlign = align; ctx.fillText(txt, x, y); };
  const box = (x, y, w, h, stroke) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, 7) : ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fillStyle = col.sf; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = stroke; ctx.stroke(); };
  const draw = () => {
    if (!canvas.isConnected) { stopFlow(); return; }
    if (frame % 60 === 0) readCols();
    frame++;
    const N = node(), nm = names();
    ctx.clearRect(0, 0, W, H);
    // guide lines
    ctx.strokeStyle = col.line; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
    ctx.beginPath(); N.src.forEach(s => { ctx.moveTo(s.x, s.y); ctx.lineTo(N.bronze.x, N.bronze.y); });
    ctx.moveTo(N.bronze.x, N.bronze.y); ctx.lineTo(N.gold.x, N.gold.y); ctx.moveTo(N.rules.x, N.rules.y); ctx.lineTo(N.quar.x, N.quar.y); ctx.stroke(); ctx.setLineDash([]);
    // particles
    const spawnRate = narrow() ? 0.35 : 0.6;
    if (Math.random() < spawnRate) spawn();
    const divert = Math.min(0.6, FLOW.rate * 2.6);
    for (const p of FLOW.parts) {
      const tgt = p.path[p.seg];
      if (!tgt) { p.dead = true; continue; }
      const ty = tgt.y + (tgt === N.quar ? 0 : p.jitter * 0.4), dx = tgt.x - p.x, dy = ty - p.y, dist = Math.hypot(dx, dy);
      if (dist < p.sp + 1) {
        p.x = tgt.x; p.y = ty; p.seg++;
        if (tgt === N.rules) {
          if (Math.random() < divert) { p.kind = "bad"; p.path = [N.rules, N.quar]; p.seg = 1; }
          else { p.path = [N.rules, N.silver, N.gold]; p.seg = 1; }
        }
        if (tgt === N.gold) { p.kind = "gold"; p.life = 1; p.path = []; }
        if (tgt === N.quar) { p.kind = "badhold"; p.life = 1; p.path = []; }
      } else { p.x += dx / dist * p.sp; p.y += dy / dist * p.sp; }
    }
    for (const p of FLOW.parts) {
      let c = p.kind === "bad" || p.kind === "badhold" ? col.s2 : p.kind === "gold" ? col.ac : col.s1, r = 2.6, a = 1;
      if (p.kind === "gold" || p.kind === "badhold") { p.life -= 0.035; a = Math.max(0, p.life); r = 2.6 + (1 - p.life) * 6; if (p.life <= 0) p.dead = true; }
      ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fillStyle = c; ctx.fill();
    }
    ctx.globalAlpha = 1;
    // nodes
    N.src.forEach((s, k) => { ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 7); ctx.fillStyle = col.ink3; ctx.fill(); if (!narrow()) label(nm[k] || "", s.x - 10, s.y + 4, "right", col.ink3, 10.5); });
    if (narrow()) label("SOURCES", N.src[0].x, N.src[0].y - 14, "center", col.ink3, 9);
    if (FLOW.stats) { const st = FLOW.stats, sub = (t, x, y, c) => label(t, x, y, "center", c || col.ink3, narrow() ? 9 : 10);
      sub(`${fmtInt(st.tot)}/day`, N.bronze.x, N.bronze.y + 30); label(`${fmt(st.rate * 100, 1)}% held`, N.quar.x + 8, N.quar.y - 20, "left", col.s2, narrow() ? 9 : 10);
      sub(`${fmtInt(st.tot - st.q)}/day`, N.silver.x, N.silver.y + 30); sub(`trust ${fmt(st.trust, 0)}`, N.gold.x, N.gold.y + 30, col.ac); }
    const bw = narrow() ? 54 : 92;
    box(N.bronze.x, N.bronze.y, bw, 30, "#a86b3c"); label("BRONZE", N.bronze.x, N.bronze.y + 4, "center", col.ink, narrow() ? 9 : 10.5);
    box(N.rules.x, N.rules.y, bw, 30, col.ac); label(narrow() ? "RULES" : "QUALITY RULES", N.rules.x, N.rules.y + 4, "center", col.ac, narrow() ? 9 : 10.5);
    box(N.silver.x, N.silver.y, bw, 30, "#9aa7ad"); label("SILVER", N.silver.x, N.silver.y + 4, "center", col.ink, narrow() ? 9 : 10.5);
    box(N.gold.x, N.gold.y, narrow() ? 46 : 86, 30, "#d4a72c"); label("KPI", N.gold.x, N.gold.y + 4, "center", col.ink, narrow() ? 9 : 10.5);
    box(N.quar.x, N.quar.y, narrow() ? 92 : 120, 26, col.s2); label("QUARANTINE", N.quar.x, N.quar.y + 4, "center", col.s2);
    FLOW.parts = FLOW.parts.filter(p => !p.dead).slice(-260);
    if (!REDUCED()) FLOW.raf = requestAnimationFrame(draw);
  };
  if (REDUCED()) {
    for (let i = 0; i < 120; i++) { spawn(); for (const p of FLOW.parts) { p.x += (Math.random() * 0.8) * (W * 0.6); } }
    FLOW.parts = FLOW.parts.filter(p => p.x < W * 0.5);
  }
  canvas._resize = () => { size(); };
  FLOW.raf = requestAnimationFrame(draw);
}

// ---------------------------------------------------------------- what-if model
function whatIf(on) {
  const d = D(), tr = d.trust.map(t => t.trust), n = tr.length, ivs = d.interventions;
  const bounds = [0, ...ivs.map(iv => iv.day), n];
  const segMean = k => mean(tr.slice(bounds[k], bounds[k + 1]));
  const lifts = ivs.map((iv, k) => segMean(k + 1) - segMean(k));
  const trust = tr.map((v, t) => {
    let x = v;
    ivs.forEach((iv, k) => { if (!on[iv.type]) x -= lifts[k] * clamp((t - iv.day) / 7, 0, 1); });
    return clamp(x, 0, 100);
  });
  const weeks = d.adoption.overall.length, O = d.adoption.overall, base = O[0];
  const tw = w => mean(trust.slice(w * 7, w * 7 + 7)), twObs = w => mean(tr.slice(w * 7, w * 7 + 7));
  const t0 = twObs(0);
  const sim = (twf, sens) => { let prev = base; const out = []; for (let w = 0; w < weeks; w++) { const lag = twf(Math.max(0, w - 2)); const target = base + sens * (lag - t0); prev = prev + 0.55 * (target - prev); out.push(clamp(prev, 0, 100)); } return out; };
  const end1 = sim(twObs, 1).at(-1);
  const sens = (O.at(-1) - base) / Math.max(1e-6, end1 - base);
  const mult = (on.people ? 1 : 0.35) * (on.process ? 1 : 0.7);
  const adoption = sim(tw, sens * mult);
  return { trust, adoption, observedTrust: tr, observedAdoption: O };
}
function whatIfVerdict(on, r) {
  const off = ["technology", "process", "people"].filter(x => !on[x]);
  if (!off.length) return "All three together: the data becomes decision-grade and people use it on every shift.";
  const t = Math.round(last7(r.trust)), a = r.adoption.at(-1), A = r.observedAdoption.at(-1), gap = A - a;
  const s1 = t >= 90 ? `The data still reaches decision-grade (trust ${fmt(t, 0)}).` : `The data stays below decision-grade (trust ${fmt(t, 0)}).`;
  const s2 = gap > 1 ? `Adoption ends at ${fmt(a, 0)}%, ${fmt(gap, 0)} points short of the ${fmt(A, 0)}% reached with all three.` : `Adoption ends at ${fmt(a, 0)}%.`;
  const s3 = off.length === 3 ? "Nothing changes: the baseline continues." : !on.people ? "Better data alone does not change how people work." : !on.process ? "Without SOPs, nothing holds the change in place." : "Engagement cannot fix numbers that are wrong at source.";
  return `${s1} ${s2} ${s3}`;
}

// ---------------------------------------------------------------- framework view
const PILLAR_ICON = {
  strategy: "M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 100 8 4 4 0 000-8z",
  people: "M8 11a3 3 0 100-6 3 3 0 000 6zM16 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3 2.5-5 5-5s5 2 5 5M13 15.5c.9-.3 2-.5 3-.5 2.5 0 5 2 5 5",
  process: "M4 6h10M4 12h16M4 18h10M17 4l3 2-3 2M17 16l3 2-3 2",
  technology: "M4 5h16v10H4zM9 19h6M12 15v4",
  data: "M12 4c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  governance: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z",
  value: "M4 17l5-5 4 4 7-8M15 8h5v5",
};
const icon = (id, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PILLAR_ICON[id]}"/></svg>`;

function pillarKpis(id) {
  const d = D(), tr = d.trust.map(t => t.trust), ad = adoptionNowWas(), ak = d.change.adkar;
  const L = ["Awareness", "Desire", "Knowledge", "Ability", "Reinforcement"];
  const avg = which => L.map((_, k) => mean(d.change.adkar_groups.map(g => ak[which][g][k])));
  const nowA = avg("current"), weakest = L[nowA.indexOf(Math.min(...nowA))];
  const mat = d.maturity, mNow = mean(mat.map(m => m.now)), mWas = mean(mat.map(m => m.baseline));
  const acc = d.transformation.filter(x => x.stage >= 4).length, val = d.transformation.filter(x => x.stage === 5).length;
  const o = d.ops, rc = series("recon_error_pct");
  const k = (l, v, sub) => ({ l, v, sub });
  return {
    strategy: [k("Strategic objective", "1", d.goal_tree.objective), k("Operational KPIs with targets", d.goal_tree.kpis.length, d.goal_tree.kpis.map(x => x.kpi).join(" · "))],
    people: [k("Adoption", `${fmt(ad.was, 0)} → ${fmt(ad.now, 0)}%`, "share of target users active weekly"), k("Weakest ADKAR element now", weakest, "where the next action goes"), k("Stakeholder layers engaged", d.layers.length, "frontline to leadership")],
    process: [k("Procedures & SOPs from the approach", d.layers.length, "one per stakeholder layer"), k("Capabilities accepted in the field", `${acc} of ${d.transformation.length}`, "requirement → acceptance → evidence"), k("Timeliness", `${fmt(first7(d.dimensions.timeliness), 0)} → ${fmt(last7(d.dimensions.timeliness), 0)}%`, "data entered inside its SLA")],
    technology: [k("Availability, last month", `${fmt(o.sla.at(-1).availability, 2)}%`, `target ${o.sla_target}%`), k("Mean time to restore", `${fmt(o.mttr_before, 1)} → ${fmt(o.mttr_after, 1)} h`, "before vs after the first fix"), k("Records validated per day", fmtInt(totals().bronze / d.trust.length), "through the medallion pipeline")],
    data: [k("Data trust score", `${fmt(first7(tr), 0)} → ${fmt(last7(tr), 0)}`, trustBand(last7(tr)).label), k("Rule pass rate", `${fmt(last7(d.trust.map(t => t.pass_rate)), 1)}%`, "last 7 days, all sources"), k("Reconciliation", `${fmt(first7(rc), 1)}% → ${fmt(last7(rc), 1)}%`, "gap against an independent source")],
    governance: [k("Datasets with owner and steward", `${d.datasets.length} of ${d.datasets.length}`, "named, not shared mailboxes"), k("KPIs in the glossary", d.glossary.length, "one definition, one owner"), k("Governance maturity", `${fmt(mWas, 1)} → ${fmt(mNow, 1)}`, "average of 6 areas, out of 5")],
    value: [k("Capabilities with value realised", `${val} of ${d.transformation.length}`, "recorded only once it shows in operations"), k("Strategic objective", "", d.goal_tree.objective)],
  }[id];
}

V.framework = () => {
  const F = S.data.framework, d = D(), P = Object.fromEntries(F.pillars.map(p => [p.id, p]));
  const sel = S.sel.fw || "people";
  const nodeBtn = (id, extra = "") => {
    const p = P[id];
    return `<button type="button" class="fw-node fw-${id} ${extra}" data-sel="fw" data-v="${id}" aria-pressed="${sel === id}">
      <span class="fw-ic">${icon(id)}</span><span class="fw-tx"><span class="fw-name">${esc(p.name)}</span><span class="fw-q">${esc(p.question)}</span></span></button>`;
  };
  const p = P[sel], kp = pillarKpis(sel);
  const detail = `<div class="fw-detail">
      <div class="fw-dh"><span class="fw-ic big">${icon(sel)}</span><div><div class="eyebrow">${esc(p.name)}</div><h2 class="fw-dq">${esc(p.question)}</h2></div></div>
      <div class="grid g-21" style="gap:22px;margin-top:14px">
        <div><div class="lbl-sm">What I do</div><ul class="fw-list">${p.do.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
          <div class="lbl-sm" style="margin-top:14px">Frameworks</div><div class="stack">${p.frameworks.map(x => `<span class="chip">${esc(x)}</span>`).join("")}</div></div>
        <div class="fw-kpis"><div class="lbl-sm">In ${esc(d.site)}</div>${kp.map(x => `<div class="fw-kpi"><div class="l">${esc(x.l)}</div>${x.v !== "" ? `<div class="v num">${esc(String(x.v))}</div>` : ""}<div class="s">${esc(x.sub)}</div></div>`).join("")}
          <a class="btn" href="#${p.evidence}" style="margin-top:12px">See the evidence <span aria-hidden="true">→</span></a></div>
      </div></div>`;
  const ffp = [
    ["On purpose", `${d.glossary.length}/${d.glossary.length}`, "KPIs with a named owner"],
    ["On time", `${fmt(last7(d.dimensions.timeliness), 1)}%`, "inside freshness SLA, last 7 days"],
    ["Relevant", `${fmt(last7(d.dimensions.uniqueness), 1)}%`, "at contract grain, no duplicates"],
    ["Trusted", fmt(last7(d.trust.map(t => t.trust)), 0), "trust score, validated and reconciled"],
  ];
  const quadCls = q => q === "Manage closely" ? "accent" : "";
  const layers = d.layers.map((l, i) => `<tr><td><div class="ly-n"><span class="ly-i num">${i + 1}</span><b>${esc(l.layer)}</b></div></td>
      <td>${esc(l.goal)}</td><td>${esc(l.pain)}</td>
      <td><span class="chip ${quadCls(l.quadrant)}">${esc(l.quadrant)}</span><div class="note" style="margin-top:4px">ADKAR: ${esc(l.adkar_focus)}</div><div style="margin-top:4px">${esc(l.approach)}</div></td>
      <td>${esc(l.process)}</td><td>${esc(l.technology)}</td><td class="mono" style="font-size:12px">${esc(l.signal)}</td></tr>`).join("");
  const gt = d.goal_tree;
  const tree = `<div class="gt">
      <div class="gt-obj"><div class="lbl-sm">Strategic objective</div><div class="gt-ot">${esc(gt.objective)}</div></div>
      <div class="gt-rows">${gt.kpis.map(k => `<div class="gt-row"><div class="gt-kpi"><div class="t">${esc(k.kpi)}</div><div class="s">${esc(k.target)}</div></div>
        <div class="gt-arrow" aria-hidden="true">→</div><div class="gt-data">${k.data.map(x => `<div>${esc(x)}</div>`).join("")}</div></div>`).join("")}</div></div>`;
  const mat = d.maturity.map(m => `<div class="mat"><div class="mat-h"><span>${esc(m.area)}</span><span class="num"><span style="color:var(--ink-3)">${m.baseline}</span> → <b>${m.now}</b> / 5</span></div>
      <div class="mat-bar"><i style="width:${m.baseline * 20}%" class="was"></i><i style="width:${m.now * 20}%" class="now"></i></div></div>`).join("");
  const on = S.sel.wi || { technology: true, process: true, people: true };
  S.sel.wi = on;
  const tgl = d.interventions.map(iv => `<button type="button" class="tgl ${iv.type}" data-wi="${iv.type}" aria-pressed="${!!on[iv.type]}"><span class="sw"><i></i></span><span><b>${esc(iv.type[0].toUpperCase() + iv.type.slice(1))}</b><small>${esc(iv.title)}</small></span></button>`).join("");
  const html = `
  ${header("The framework", F.name, esc(F.thesis))}
  <section class="panel fw-panel">
    <div class="fw">
      <div class="fw-top">${nodeBtn("strategy")}<div class="fw-loop" aria-hidden="true"><span>measure, learn, feed back</span></div>${nodeBtn("value")}</div>
      <div class="fw-pillars">${nodeBtn("people", "pillar")}${nodeBtn("process", "pillar")}${nodeBtn("technology", "pillar")}</div>
      ${nodeBtn("governance", "band")}
      <button type="button" class="fw-node fw-data band" data-sel="fw" data-v="data" aria-pressed="${sel === "data"}">
        <span class="fw-ic">${icon("data")}</span><span class="fw-tx"><span class="fw-name">Data foundation</span>
        <span class="fw-split"><span><b>Data for decisions</b> baselines, pain points, adoption</span><span><b>Data from technology</b> on purpose, on time, relevant, trusted</span></span></span></button>
    </div>
    ${detail}
  </section>
  <section class="panel">${panelHead("How a cycle runs", "The order matters: goals before tools, and evidence before value.")}
    <ol class="cycle">${F.cycle.map((c, i) => `<li><span class="cy-n num">${i + 1}</span><div><b>${esc(c.step)}</b><p>${esc(c.detail)}</p></div></li>`).join("")}</ol></section>
  <section class="panel">${panelHead("What if only one pillar moved?", "Switch an intervention off to see what happens to trust and adoption. The faint line is what actually happened.")}
    <div class="tgls">${tgl}</div>
    <div class="grid g-2" style="margin-top:16px">
      <div><div class="lbl-sm">Data trust score, 7-day</div><div class="chart" id="c-wi-t"></div></div>
      <div><div class="lbl-sm">Adoption, % of target users</div><div class="chart" id="c-wi-a"></div></div>
    </div>
    <div class="wi-out" id="wiOut"></div>
    <p class="note" style="margin:10px 0 0">A simple model built on this site's data: each intervention's lift in trust is removed when it is switched off, and adoption follows trust with a two-week lag. Engagement (people) and procedures (process) set how strongly adoption responds to better data.</p>
  </section>
  <section class="grid g-12">
    <div class="panel">${panelHead("Fit-for-purpose data", "What technology must deliver for the operation to rely on it.")}
      <div class="ffp">${ffp.map(([n, v, s], i) => `<div class="ffp-i"><div class="lbl-sm">${n}</div><div class="v num">${v}</div><div class="s">${s}</div><div class="note">${esc(F.fit_for_purpose[i].detail)}</div></div>`).join("")}</div></div>
    <div class="panel">${panelHead("Goal tree", "Strategy flows down to KPIs, and KPIs down to the data rules that protect them.")}${tree}</div>
  </section>
  <section class="panel flush">${panelHead("Stakeholder layers: one approach per layer", "From the frontline to the site leadership. Each layer gets its own goal, pain point, engagement approach, process and technology touchpoint, and a data signal that tells us if it is working.")}
    <div class="tbl-wrap"><table class="layers"><thead><tr><th>Layer</th><th>Goal</th><th>Pain point</th><th>Approach</th><th>Process</th><th>Technology</th><th>Data signal</th></tr></thead><tbody>${layers}</tbody></table></div></section>
  <section class="panel">${panelHead("Data governance maturity", "Self-assessed at baseline and now, against a five-level scale.", `<div class="legend"><span><i class="sq" style="background:var(--s-muted)"></i>Baseline</span><span><i class="sq" style="background:var(--s1)"></i>Now</span></div>`)}
    <div class="mats">${mat}</div></section>`;
  const after = () => {
    const draw = () => {
      const r = whatIf(S.sel.wi);
      const x = d.trust.map(t => t.day);
      lineChart($("#c-wi-t"), { x, h: 220, yMin: 40, yMax: 100, ticks: [40, 60, 80, 100], band: { from: 90, to: 100, label: "Decision-grade" },
        series: [{ name: "Actual", color: "var(--s-muted)", values: roll7(r.observedTrust), width: 1.4 }, { name: "Scenario", color: "var(--s1)", values: roll7(r.trust), width: 2.4, area: true }],
        markers: ivMarkers(), fmtV: v => fmt(v, 0), label: "Trust score scenario", noAnim: true });
      lineChart($("#c-wi-a"), { x: d.adoption.weeks, h: 220, yMin: 20, yMax: 100, ticks: [20, 40, 60, 80, 100], xFmt: w => dLabel(w), xFmtLong: w => "Week of " + dLabel(w),
        series: [{ name: "Actual", color: "var(--s-muted)", values: r.observedAdoption, width: 1.4 }, { name: "Scenario", color: "var(--s3)", values: r.adoption, width: 2.4, dots: true }],
        markers: ivMarkers(7), unit: "%", fmtV: v => fmt(v, 0), label: "Adoption scenario", noAnim: true });
      const tEnd = Math.round(last7(r.trust)), aEnd = r.adoption.at(-1), dg = r.trust.slice(-30).filter(v => v >= 90).length;
      $("#wiOut").innerHTML = `<div class="wi-tiles">
          <div><div class="lbl-sm">Trust, last 7 days</div><div class="v num">${fmt(tEnd, 0)}</div>${pill(trustBand(tEnd).cls, trustBand(tEnd).label)}</div>
          <div><div class="lbl-sm">Adoption, final week</div><div class="v num">${fmt(aEnd, 0)}%</div>${pill(adBand(aEnd).cls, adBand(aEnd).label)}</div>
          <div><div class="lbl-sm">Decision-grade days, last 30</div><div class="v num">${dg}</div></div></div>
        <p class="verdict">${esc(whatIfVerdict(S.sel.wi, r))}</p>`;
    };
    draw();
    $$("[data-wi]").forEach(b => b.addEventListener("click", () => { const k = b.dataset.wi; S.sel.wi[k] = !S.sel.wi[k]; b.setAttribute("aria-pressed", String(S.sel.wi[k])); draw(); }));
  };
  return [html, after];
};

// ---------------------------------------------------------------- playbook view
V.playbook = () => {
  const F = S.data.framework, d = D(), a = d.adoption;
  const type = S.sel.pbType || "all", pil = S.sel.pbPillar || "all";
  const PN = Object.fromEntries(F.pillars.map(p => [p.id, p.name]));
  const cases = F.playbook.filter(c => (type === "all" || c.type === type) && (pil === "all" || c.pillars.includes(pil)));
  const quadCase = { hl: "E2", lh: "E1", ll: "N1" };
  const card = c => `<article class="pb ${c.type}" id="case-${c.id}">
      <div class="pb-top"><span class="chip ${c.type === "edge" ? "accent" : ""}">${c.type === "edge" ? "Edge case" : "Normal case"} · ${esc(c.id)}</span>
        <span class="pb-pills">${c.pillars.map(p => `<span class="pb-p">${icon(p)}${esc(PN[p])}</span>`).join("")}</span></div>
      <h3>${esc(c.title)}</h3>
      <dl class="pb-dl"><dt>What you see</dt><dd>${esc(c.symptom)}</dd><dt>Signal in the data</dt><dd>${esc(c.signal)}</dd><dt>Root cause</dt><dd>${esc(c.root_cause)}</dd></dl>
      <div class="lbl-sm" style="margin-top:12px">Recommended resolution</div>
      <ol class="pb-res">${c.resolution.map(r => `<li>${esc(r)}</li>`).join("")}</ol>
      <p class="pb-ex"><span>In FieldTrust</span>${esc(c.example)}</p></article>`;
  const typeSel = `<div class="sel" role="group" aria-label="Case type">${[["all", "All"], ["normal", "Normal"], ["edge", "Edge"]].map(([k, l]) => `<button type="button" data-sel="pbType" data-v="${k}" aria-pressed="${type === k}">${l}</button>`).join("")}</div>`;
  const pilSel = `<div class="sel" role="group" aria-label="Pillar">${[["all", "All pillars"], ...["people", "process", "technology", "data", "governance"].map(k => [k, PN[k]])].map(([k, l]) => `<button type="button" data-sel="pbPillar" data-v="${k}" aria-pressed="${pil === k}">${esc(l)}</button>`).join("")}</div>`;
  const html = `
  ${header("Playbook", "Normal cases and the edge cases that sink programmes", "Each case pairs what you see on site with the signal in the data, the root cause, and the resolution I would apply. Start with the quadrant: where trust and adoption sit tells you which pillar to work on.")}
  <section class="grid g-12">
    <div class="panel">${panelHead("Where are you?", "Weekly trust against adoption for this site. Click a quadrant to open its case.")}<div class="chart" id="c-quad"></div></div>
    <div class="panel">${panelHead("Reading the quadrant", "")}
      <div class="qd-list">
        <button type="button" class="qd" data-case="E2"><span class="qd-k crit">Low trust · high adoption</span><b>Most dangerous.</b> People act confidently on wrong numbers. Fix the data and make trust visible on every KPI.</button>
        <button type="button" class="qd" data-case="N1"><span class="qd-k neutral">Low trust · low adoption</span><b>Start here.</b> Discovery first: goals, pain points per layer, baseline data quality.</button>
        <button type="button" class="qd" data-case="E1"><span class="qd-k warn">High trust · low adoption</span><b>A people problem.</b> Find the weakest ADKAR element and retire the old way.</button>
        <div class="qd"><span class="qd-k good">High trust · high adoption</span><b>Sustain and scale.</b> Reinforce through reviews, track value, take the next use case.</div>
      </div></div>
  </section>
  <section class="pb-filters">${typeSel}${pilSel}</section>
  <section class="pb-grid">${cases.map(card).join("") || `<div class="panel note">No cases match these filters.</div>`}</section>`;
  const after = () => {
    const host = $("#c-quad"), W = Math.max(260, host.clientWidth), H = 300, m = { t: 14, r: 14, b: 40, l: 44 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x0 = 50, x1 = 100, y0 = 20, y1 = 100, X = v => m.l + (clamp(v, x0, x1) - x0) / (x1 - x0) * iw, Y = v => m.t + ih - (clamp(v, y0, y1) - y0) / (y1 - y0) * ih;
    const tx = 90, ty = 60;
    const quads = [
      { k: "ll", x: X(x0), y: Y(ty), w: X(tx) - X(x0), h: Y(y0) - Y(ty), fill: "var(--surface-2)", lab: "Start here", c: "N1" },
      { k: "lh", x: X(tx), y: Y(ty), w: X(x1) - X(tx), h: Y(y0) - Y(ty), fill: "var(--warn-soft)", lab: "People gap", c: "E1" },
      { k: "hl", x: X(x0), y: Y(y1), w: X(tx) - X(x0), h: Y(ty) - Y(y1), fill: "var(--crit-soft)", lab: "Danger", c: "E2" },
      { k: "hh", x: X(tx), y: Y(y1), w: X(x1) - X(tx), h: Y(ty) - Y(y1), fill: "var(--good-soft)", lab: "Sustain", c: null },
    ];
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Trust versus adoption quadrant with this site's weekly path">`;
    quads.forEach(q => { s += `<rect class="qrect" ${q.c ? `data-case="${q.c}" style="fill:${q.fill};cursor:pointer"` : `style="fill:${q.fill}"`} x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}"/>`;
      s += `<text x="${q.x + 8}" y="${q.y + 16}" style="fill:var(--ink-2);font-weight:600;pointer-events:none">${q.lab}</text>`; });
    [50, 60, 70, 80, 90, 100].forEach(t => { s += `<text x="${X(t)}" y="${H - 22}" text-anchor="middle">${t}</text>`; });
    [20, 40, 60, 80, 100].forEach(t => { s += `<text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${t}%</text>`; });
    s += `<text x="${m.l + iw / 2}" y="${H - 4}" text-anchor="middle">Data trust score (weekly)</text>`;
    const pts = a.trust_weekly.map((t, i) => [X(t), Y(a.overall[i])]);
    s += `<path class="draw" d="M${pts.map(p => p.map(v => v.toFixed(1)).join(",")).join("L")}" fill="none" style="stroke:var(--ink-2)" stroke-width="1.6" stroke-dasharray="none"/>`;
    pts.forEach((p, i) => { s += `<circle cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 6 : 4}" style="fill:${i === pts.length - 1 ? "var(--accent)" : "var(--s1)"};stroke:var(--surface)" stroke-width="2" data-tt="${esc(`<div class="tt-h">Week ${i + 1}</div>${ttRow("Trust", "var(--s1)", fmt(a.trust_weekly[i], 1))}${ttRow("Adoption", "var(--s3)", fmt(a.overall[i], 1) + "%")}`)}"/>`; });
    s += `<text x="${pts.at(-1)[0] - 8}" y="${pts.at(-1)[1] - 10}" text-anchor="end" style="fill:var(--ink);font-weight:600">now</text>`;
    s += `<text x="${pts[0][0] + 8}" y="${pts[0][1] + 16}" style="fill:var(--ink-2)">week 1</text></svg>`;
    host.innerHTML = s;
    $$("path.draw", host).forEach(p => { try { p.style.setProperty("--len", Math.ceil(p.getTotalLength()) + 1); } catch { p.classList.remove("draw"); } });
    const open = id => { S.sel.pbType = "all"; S.sel.pbPillar = "all"; render(false); const el = $("#case-" + id); if (el) { el.scrollIntoView({ behavior: REDUCED() ? "auto" : "smooth", block: "center" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1600); } };
    $$("[data-case]").forEach(el => el.addEventListener("click", () => open(el.dataset.case)));
  };
  return [html, after];
};

// ---------------------------------------------------------------- value chain
const VC = { timer: 0, raf: 0, tween: 0, mov: 0, vb: null, tour: false };
const VC_TYPES = { "time-series": ["Time-series", "lg-ts"], event: ["Event / transaction", "lg-ev"], document: ["Document / report", "lg-doc"], geospatial: ["Geospatial / model", "lg-geo"] };
const VC_STEP_MS = 7000;
function vcShape(type) {
  const c = (VC_TYPES[type] || VC_TYPES.event)[1];
  const p = type === "time-series" ? `<circle cx="6" cy="6" r="5" class="${c}"/>`
    : type === "document" ? `<path d="M2 1H8L10.5 3.5V11H2Z" class="${c}"/>`
    : type === "geospatial" ? `<path d="M6 .5L11.5 6 6 11.5.5 6Z" class="${c}"/>`
    : `<rect x="1.2" y="1.2" width="9.6" height="9.6" rx="1.2" class="${c}"/>`;
  return `<svg viewBox="0 0 12 12" aria-hidden="true">${p}</svg>`;
}
function vcStop() {
  if (VC.io) { VC.io.disconnect(); VC.io = null; }
  if (VC.onVis) { document.removeEventListener("visibilitychange", VC.onVis); VC.onVis = null; }
  clearInterval(VC.timer); cancelAnimationFrame(VC.raf); cancelAnimationFrame(VC.tween); cancelAnimationFrame(VC.mov);
  VC.timer = VC.raf = VC.tween = 0; VC.tour = false;
}
const ICON_USER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
const ICON_SWAP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>`;

const fmtUSD = v => v == null ? "—" : v >= 1e6 ? `US$${fmt(v / 1e6, 1)}M` : v >= 1e3 ? `US$${fmt(v / 1e3, 0)}k` : `US$${fmtInt(v)}`;
function vcLive(st) {
  const key = st.handoff && st.handoff.live; if (!key) return null;
  const d = D(), s = d.gold.map(g => g[key]), now = last7(s), was = first7(s), tol = d.reconciliation.tolerance_pct;
  const cls = now <= tol ? "good" : now <= tol * 2 ? "warn" : "crit";
  const v = st.handoff.value;
  let value = null;
  if (v) {
    const vol = d.gold.map(g => g[v.volume_key]);
    value = { now: now / 100 * last7(vol) * 30 * v.unit_price, was: was / 100 * first7(vol) * 30 * v.unit_price, label: v.price_label, at_risk: v.at_risk };
  }
  return { key, series: roll7(s), now, was, tol, cls, value, label: cls === "good" ? "Within tolerance" : cls === "warn" ? "Near tolerance" : "Out of tolerance", rule: d.reconciliation.id };
}
function vcCard(st, i, n) {
  const live = vcLive(st);
  const rows = st.data.map(r => `<tr><td>${esc(r.name)}<span class="src">${esc(r.source)}</span></td>
    <td><span class="vc-type">${vcShape(r.type)}${esc((VC_TYPES[r.type] || [r.type])[0])}</span></td>
    <td class="mono">${esc(r.format)}</td><td>${esc(r.frequency)}</td><td>${esc(r.volume)}</td></tr>`).join("");
  const ft = (st.fieldtrust || []).map(ds => `<a class="chip accent" href="#pipeline" title="Open in Data engineering">${esc(ds)}</a>`).join(" ");
  return `<div class="vc-card vc-card-enter">
    <div>
      <div class="eyebrow">Stage ${i + 1} of ${n}</div>
      <h3>${esc(st.name)}</h3>
      <p class="what">${esc(st.what)}</p>
      <div class="vc-sub">Assets on site</div><p class="note" style="margin:0;color:var(--ink-2)">${esc(st.assets)}</p>
      <div class="vc-sub">Who consumes this data</div>
      <div class="vc-cons">${st.consumers.map(c => `<div class="vc-con">${ICON_USER}<b>${esc(c.role)}</b><span>${esc(c.uses)}</span></div>`).join("")}</div>
      <div class="vc-sub">Business function</div><div class="vc-fn">${esc(st.function)}</div>
      <div class="vc-sub">KPIs fed by this data</div><div class="vc-kpis">${st.kpis.map(k => `<span class="chip">${esc(k)}</span>`).join("")}</div>
    </div>
    <div>
      <div class="vc-sub">Data produced here</div>
      <div class="tbl-wrap"><table class="vc-data"><thead><tr><th>Data</th><th>Type</th><th>Format</th><th>Frequency</th><th>Volume</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="vc-sub">Sample record</div>
      <div class="vc-sample-h"><span>${esc(st.sample.system)}</span><span>${ft}</span></div>
      <pre class="vc-sample">${esc(String(st.sample.record).trimEnd())}</pre>
      <div class="grid g-2" style="margin-top:18px;gap:18px">
        <div><div class="vc-sub">Where trust breaks</div><ul class="vc-risks">${st.risks.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>
        <div><div class="vc-sub">Hand-off check</div><div class="vc-hand${live ? " live" : ""}">${ICON_SWAP}<div>To <b>${esc(st.handoff.to)}</b>: ${esc(st.handoff.check)}.
          ${live ? `<div class="vc-live"><div class="vc-live-row"><span class="vc-live-v num">${fmt(live.now, 2)}%</span>${pill(live.cls, live.label)}</div>
            <div class="note">7-day gap now, against a ${fmt(live.tol, 0)}% tolerance (rule ${esc(live.rule)}). Week 1 was ${fmt(live.was, 2)}%.</div>
            ${spark(live.series, "var(--s1)", 220, 36)}
            ${live.value ? `<div class="vc-value"><div class="vc-value-h">Value at stake</div>
              <div class="vc-value-row"><span class="vc-value-v num">${fmtUSD(live.value.now)}</span><span class="note">per month now</span><span class="vc-value-was num"><span class="note">week 1: </span>${fmtUSD(live.value.was)}</span></div>
              <div class="note">${esc(live.value.at_risk)}, at ${esc(live.value.label)}. Synthetic prices, for illustration.</div></div>` : ""}
            <a class="vc-live-link" href="#quality">See it in Data quality →</a></div>`
          : `<div class="note" style="margin-top:6px">Not modelled in FieldTrust yet. It is on the roadmap as a reconciliation rule.</div>`}</div></div></div>
      </div>
    </div>
  </div>`;
}

V["value-chain"] = () => {
  const vc = S.data.valuechain[S.domain], stages = vc.stages, sc = window.FTScenes[S.domain](stages), n = stages.length;
  if (!stages.some(s => s.id === S.sel.vc)) S.sel.vc = stages[0].id;
  const selIdx = stages.findIndex(s => s.id === S.sel.vc);
  let hits = "", pins = "";
  stages.forEach((st, i) => {
    const g = sc.stages[st.id], [bx, by, bw, bh] = g.box, [px, py] = g.pin;
    hits += `<rect class="vc-hit" data-vc="${st.id}" x="${bx}" y="${by}" width="${bw}" height="${bh}"/>`;
    const tw = st.name.length * 6.9 + 18, left = px + tw + 30 > sc.w;
    pins += `<g class="vc-pin" data-vc="${st.id}" tabindex="0" role="button" aria-label="Stage ${i + 1}: ${esc(st.name)}" transform="translate(${px},${py})"><g class="pin-core">
      <rect class="pin-bg" x="${left ? -tw - 18 : 8}" y="-11" width="${tw + 10}" height="22" rx="11"/>
      <text class="pin-t" x="${left ? -24 : 22}" y="4" text-anchor="${left ? "end" : "start"}">${esc(st.name)}</text>
      <circle class="pin-dot" r="13"/><text class="pin-n" y="4">${i + 1}</text></g></g>`;
  });
  let hands = "";
  stages.forEach((st, i) => {
    const hp = sc.stages[st.id].hand; if (!hp || !st.handoff) return;
    const live = vcLive(st), [hx, hy] = hp, cls = live ? live.cls : "neutral";
    const tt = `<div class="tt-h">Hand-off · ${esc(st.name)} → ${esc(st.handoff.to)}</div><div style="max-width:260px">${esc(st.handoff.check)}</div>` +
      (live ? `<div style="margin-top:6px"><b>${fmt(live.now, 2)}%</b> gap now · tolerance ${fmt(live.tol, 0)}% · week 1 ${fmt(live.was, 2)}%</div>${live.value ? `<div style="margin-top:4px"><b>${fmtUSD(live.value.now)}</b>/month at stake (week 1: ${fmtUSD(live.value.was)})</div>` : ""}` : `<div style="margin-top:6px;color:var(--ink-3)">Not modelled yet</div>`);
    hands += `<g class="vc-handm ${cls}${live ? " live" : ""}" data-vc="${st.id}" data-tt="${esc(tt)}" transform="translate(${hx},${hy})">
      ${live ? `<circle r="9" class="hm-ring"><animate attributeName="r" values="7;18" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;0" dur="2s" repeatCount="indefinite"/></circle>` : ""}
      <rect x="-6" y="-6" width="12" height="12" rx="2" transform="rotate(45)" class="hm-d"/>
      ${live ? (() => { const txt = `${fmt(live.now, 2)}% GAP${live.value ? ` · ${fmtUSD(live.value.now).replace("US$", "$")}/MO` : ""}`, w = txt.length * 6.3 + 18; return `<g transform="translate(0,-24)"><rect x="${-w / 2}" y="-10" width="${w}" height="20" rx="4" class="hm-bg"/><text y="4" text-anchor="middle" class="hm-t">${txt}</text></g>`; })() : ""}</g>`;
  });
  const svg = `<svg id="vcSvg" viewBox="0 0 ${sc.w} ${sc.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Animated cross-section of the ${esc(DOMAINS[S.domain].label)} value chain with data flowing to the data layer">
    ${sc.svg}${hits}<rect class="vc-hl" id="vcHl" rx="12"/>${hands}${pins}</svg>`;
  const steps = stages.map((st, i) => `<button type="button" class="vc-step" data-vc="${st.id}" aria-pressed="false"><b>${i + 1}</b>${esc(st.name)}</button>`).join("");
  const legend = Object.entries(VC_TYPES).map(([k, [lab]]) => `<span>${vcShape(k)}${esc(lab)}</span>`).join("") +
    `<span><svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx="1" transform="rotate(45 6 6)" class="lg-hand"/></svg>Hand-off check (live where modelled)</span>` +
    `<span class="note">Packet rate follows data frequency: 1-second historians flood, yearly models trickle.</span>`;
  const mapRows = stages.map((st, i) => st.data.map((d, k) => {
    const span = st.data.length, first = k === 0;
    return `<tr data-vc="${st.id}" class="${first ? "vc-first" : ""}">${first ? `<td rowspan="${span}"><b>${i + 1}. ${esc(st.name)}</b></td>` : ""}
      <td><span class="vc-type">${vcShape(d.type)}${esc(d.name)}</span></td><td class="mono">${esc(d.format)}</td><td>${esc(d.frequency)}</td>
      ${first ? `<td rowspan="${span}">${st.consumers.map(c => esc(c.role)).join("<br>")}</td><td rowspan="${span}">${esc(st.function.split(". ")[0])}.</td>` : ""}</tr>`;
  }).join("")).join("");
  const html = `<section class="grid" style="gap:22px">
  ${header(`Value chain · ${DOMAINS[S.domain].label} pack`, vc.title, esc(vc.lede))}
  <section class="panel flush">
    ${panelHead("Physical flow, mapped to data", "Click a numbered stage or play the tour. Each asset sends its data up to the data layer; shape and colour show the type of data.",
      `<div class="vc-ctrl"><button class="btn primary" type="button" id="vcTour" aria-pressed="false"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg><span>Play the tour</span></button><button class="btn" type="button" id="vcAll">Whole chain</button><button class="btn" type="button" id="vcMotion" aria-pressed="false"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg><span>Pause motion</span></button></div>`)}
    <div class="vc-scene has-sel" id="vcScene">${svg}</div>
    <div class="vc-steps" id="vcSteps">${steps}</div>
    <div class="vc-foot"><div class="vc-legend">${legend}</div><div class="vc-prog" aria-hidden="true"><i id="vcProg"></i></div></div>
  </section>
  <section class="panel" id="vcCard" aria-live="polite">${vcCard(stages[selIdx], selIdx, n)}</section>
  <section class="panel">${panelHead("Data map", "The whole chain on one page: what each stage produces, in what format, how often, and who uses it. Click a row to jump to that stage.")}
    <div class="tbl-wrap"><table class="vc-map"><thead><tr><th>Stage</th><th>Data produced (shape = type)</th><th>Format</th><th>Frequency</th><th>Consumers</th><th>Business function</th></tr></thead><tbody>${mapRows}</tbody></table></div>
  </section>
  </section>`;

  const after = () => {
    const scene = $("#vcScene"), svgEl = $("#vcSvg");
    if (!scene || scene.dataset.bound) return;
    scene.dataset.bound = "1";
    const full = [0, 0, sc.w, sc.h], aspect = sc.w / sc.h;
    VC.vb = full.slice();
    // vehicles on winding roads: placed along the path each frame, kept upright and
    // facing the way they travel (SMIL's auto-rotate would flip them upside down)
    const movers = $$(".sc-mover", svgEl).map(g => {
      const path = svgEl.querySelector("#" + g.dataset.path);
      return path && { g, path, L: path.getTotalLength(), dur: +g.dataset.dur, off: +g.dataset.offset, rev: g.dataset.rev === "1", lane: +g.dataset.lane || 0, scale: +g.dataset.scale || 1, dir: 1 };
    }).filter(Boolean);
    const place = now => {
      movers.forEach(m => {
        const t = ((now / 1000) / m.dur + m.off) % 1, s = (m.rev ? 1 - t : t) * m.L, step = m.rev ? -2 : 2;
        const p = m.path.getPointAtLength(s), q = m.path.getPointAtLength(clamp(s + step, 0, m.L));
        let dx = q.x - p.x, dy = q.y - p.y;
        if ((m.rev && s < 2) || (!m.rev && s > m.L - 2)) { const r = m.path.getPointAtLength(clamp(s - step, 0, m.L)); dx = p.x - r.x; dy = p.y - r.y; }
        // heading: x-scale follows cos(heading) so a truck "turns" round the ring instead of flipping;
        // tilt is clamped to a realistic ramp grade
        const len = Math.hypot(dx, dy) || 1, cx = dx / len;
        if (Math.abs(dx) > .05) m.dir = dx > 0 ? 1 : -1;
        const sx = m.dir * Math.max(.28, Math.abs(cx)) * m.scale;
        const ang = clamp(Math.atan2(dy, Math.max(.05, Math.abs(dx))) * 180 / Math.PI, -12, 12);
        m.g.setAttribute("transform", `translate(${p.x.toFixed(1)},${(p.y + m.lane).toFixed(1)}) scale(${sx.toFixed(3)},${m.scale}) rotate(${ang.toFixed(1)})`);
        m.g.setAttribute("opacity", Math.min(1, t / .02, (1 - t) / .02).toFixed(2));
      });
    };
    // motion control: the viewer can pause it, and it pauses itself off screen
    let userPaused = REDUCED(), visible = true, running = false;
    place(9000);
    const loop = now => { place(now); VC.mov = requestAnimationFrame(loop); };
    const applyMotion = () => {
      const on = visible && !userPaused && !document.hidden;
      if (on === running) return;
      running = on;
      if (on) { if (svgEl.unpauseAnimations) svgEl.unpauseAnimations(); if (movers.length) VC.mov = requestAnimationFrame(loop); }
      else { if (svgEl.pauseAnimations) svgEl.pauseAnimations(); cancelAnimationFrame(VC.mov); }
    };
    const motionBtn = $("#vcMotion");
    const paintBtn = () => {
      motionBtn.setAttribute("aria-pressed", String(userPaused));
      $("span", motionBtn).textContent = userPaused ? "Play motion" : "Pause motion";
      $("svg path", motionBtn).setAttribute("d", userPaused ? "M7 4l13 8-13 8z" : "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z");
    };
    motionBtn.addEventListener("click", () => { userPaused = !userPaused; paintBtn(); applyMotion(); });
    if ("IntersectionObserver" in window) {
      VC.io = new IntersectionObserver(es => { visible = es[0].isIntersecting; applyMotion(); }, { threshold: 0.05 });
      VC.io.observe(scene);
    }
    VC.onVis = () => applyMotion(); document.addEventListener("visibilitychange", VC.onVis);
    if (svgEl.pauseAnimations && userPaused) svgEl.pauseAnimations();
    paintBtn(); applyMotion();
    const setVB = v => { VC.vb = v; svgEl.setAttribute("viewBox", v.map(x => x.toFixed(1)).join(" ")); scene.classList.toggle("zoomed", v[2] < sc.w - 1); };
    // on phones the zoomed view uses a taller frame so a stage fills the screen
    const focusOf = id => {
      const narrow = scene.clientWidth < 640, az = narrow ? 1.35 : aspect, pad = narrow ? 1.2 : 1.45;
      const [x, y, w, h] = sc.stages[id].box;
      let w2 = Math.min(sc.w, Math.max(w * pad, h * pad * az, narrow ? 380 : 540)), h2 = w2 / az;
      if (h2 > sc.h) { h2 = sc.h; w2 = h2 * az; }
      return [clamp(x + w / 2 - w2 / 2, 0, sc.w - w2), clamp(y + h / 2 - h2 / 2, 0, sc.h - h2), w2, h2];
    };
    const tweenTo = target => {
      cancelAnimationFrame(VC.tween);
      if (REDUCED()) { setVB(target); return; }
      const from = VC.vb.slice(), t0 = performance.now(), dur = 1000;
      const step = now => {
        const p = Math.min(1, (now - t0) / dur), e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        setVB(from.map((v, k) => v + (target[k] - v) * e));
        if (p < 1) VC.tween = requestAnimationFrame(step);
      };
      VC.tween = requestAnimationFrame(step);
    };
    const select = (id, zoom) => {
      const i = stages.findIndex(s => s.id === id); if (i < 0) return;
      const changed = S.sel.vc !== id || !$("#vcHl").classList.contains("on");
      S.sel.vc = id;
      $$(".vc-pin", scene).forEach(p => p.classList.toggle("on", p.dataset.vc === id));
      $$(".sc-emit", scene).forEach(p => p.classList.toggle("on", p.dataset.stage === id));
      $$("#vcSteps .vc-step").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.vc === id)));
      $$("table.vc-map tr[data-vc]").forEach(r => r.classList.toggle("on", r.dataset.vc === id));
      const [x, y, w, h] = sc.stages[id].box, hl = $("#vcHl");
      hl.setAttribute("x", x); hl.setAttribute("y", y); hl.setAttribute("width", w); hl.setAttribute("height", h); hl.classList.add("on");
      const stepBtn = $(`#vcSteps .vc-step[data-vc="${id}"]`); if (stepBtn) stepBtn.scrollIntoView({ block: "nearest", inline: "center", behavior: REDUCED() ? "auto" : "smooth" });
      if (changed) $("#vcCard").innerHTML = vcCard(stages[i], i, n);
      if (zoom) tweenTo(focusOf(id));
    };
    const stopTour = () => {
      clearInterval(VC.timer); cancelAnimationFrame(VC.raf); VC.timer = VC.raf = 0; VC.tour = false;
      const b = $("#vcTour"); if (b) { b.setAttribute("aria-pressed", "false"); $("span", b).textContent = "Play the tour"; }
      const pg = $("#vcProg"); if (pg) pg.style.width = "0";
    };
    const startTour = () => {
      VC.tour = true;
      const b = $("#vcTour"); b.setAttribute("aria-pressed", "true"); $("span", b).textContent = "Pause the tour";
      let i = Math.max(0, stages.findIndex(s => s.id === S.sel.vc));
      if (!scene.classList.contains("zoomed")) i = 0;
      let t0 = performance.now();
      select(stages[i].id, true);
      const tick = now => { const pg = $("#vcProg"); if (!pg) return; pg.style.width = `${Math.min(100, ((i + (now - t0) / VC_STEP_MS) / n) * 100)}%`; VC.raf = requestAnimationFrame(tick); };
      VC.raf = requestAnimationFrame(tick);
      VC.timer = setInterval(() => {
        i += 1; t0 = performance.now();
        if (i >= n) { stopTour(); tweenTo(full); return; }
        select(stages[i].id, true);
      }, VC_STEP_MS);
    };
    const userPick = (id, zoom = true) => { if (VC.tour) stopTour(); select(id, zoom); };
    scene.addEventListener("click", e => { const t = e.target.closest("[data-vc]"); if (t) userPick(t.dataset.vc); });
    scene.addEventListener("keydown", e => { const t = e.target.closest(".vc-pin"); if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); userPick(t.dataset.vc); } });
    $("#vcSteps").addEventListener("click", e => { const t = e.target.closest("[data-vc]"); if (t) userPick(t.dataset.vc); });
    $("table.vc-map").addEventListener("click", e => { const t = e.target.closest("tr[data-vc]"); if (!t) return; userPick(t.dataset.vc); scene.scrollIntoView({ behavior: REDUCED() ? "auto" : "smooth", block: "center" }); });
    $("#vcAll").addEventListener("click", () => { if (VC.tour) stopTour(); tweenTo(full); });
    $("#vcTour").addEventListener("click", () => { if (VC.tour) stopTour(); else startTour(); });
    select(S.sel.vc, false);
  };
  return [html, after];
};

// ---------------------------------------------------------------- shell
function renderNav() {
  let html = "", g = "";
  VIEWS.forEach(v => {
    if (v.group !== g) { g = v.group; html += `<div class="nav-group">${esc(g)}</div>`; }
    html += `<a href="#${v.id}" ${S.view === v.id ? 'aria-current="page"' : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${v.icon}"/></svg><span>${esc(v.label)}</span></a>`;
  });
  $("#nav").innerHTML = html;
}
function renderTop() {
  const d = D(), tr = last7(d.trust.map(t => t.trust)), band = trustBand(tr);
  $("#siteName").textContent = d.site;
  $("#siteMeta").textContent = `${dLabel(S.data.period.start)} – ${dLabel(S.data.period.end)} 2026 · ${d.datasets.length} sources · synthetic data`;
  $("#trustChip").textContent = fmt(tr, 0);
  $("#trustPill").innerHTML = pill(band.cls, band.label);
  $$("#domainSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.domain === S.domain)));
}
let afterFn = null;
function render(animate = true) {
  hideTT(); stopFlow(); vcStop(); if (REPLAY.timer) { clearInterval(REPLAY.timer); REPLAY.timer = null; }
  renderNav(); renderTop();
  const [html, after] = (V[S.view] || V.overview)();
  const view = $("#view");
  view.innerHTML = html;
  view.classList.remove("enter"); if (animate) { void view.offsetWidth; view.classList.add("enter"); }
  afterFn = after; if (after) after();
}
function route() {
  if (!S.data) return;
  const h = location.hash.replace("#", "");
  const next = VIEWS.some(v => v.id === h) ? h : "overview";
  const changed = next !== S.view;
  S.view = next; render(true);
  if (changed) window.scrollTo({ top: 0 });
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-domain]");
  if (b) { S.domain = b.dataset.domain; store.set("ft-domain", S.domain); S.sel = {}; render(true); return; }
  const rp = e.target.closest("[data-replay]");
  if (rp) { if (REPLAY.play) REPLAY.play(); return; }
  const s = e.target.closest("[data-sel]");
  if (s) { S.sel[s.dataset.sel] = s.dataset.v; const y = scrollY; render(false); window.scrollTo({ top: y }); }
});
$("#themeBtn").addEventListener("click", () => {
  const root = document.documentElement;
  const cur = root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  const next = cur === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next); store.set("ft-theme", next);
});
let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (afterFn) afterFn(); }, 150); });
addEventListener("hashchange", route);

const savedTheme = store.get("ft-theme");
if (savedTheme === "light" || savedTheme === "dark") document.documentElement.setAttribute("data-theme", savedTheme);
const savedDom = store.get("ft-domain"); if (savedDom && DOMAINS[savedDom]) S.domain = savedDom;

fetch("data/fieldtrust.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(data => {
  S.data = data; route();
}).catch(err => {
  $("#view").innerHTML = `<div class="panel"><h2 class="h2">Data bundle not found</h2><p class="h2-sub">Run <code class="mono">python pipeline/run.py</code> to build app/data/fieldtrust.json, then serve the app folder (for example <code class="mono">python -m http.server -d app</code>). Error: ${esc(err.message)}</p></div>`;
});
})();
