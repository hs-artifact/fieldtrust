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
  { id: "case-study", label: "Case study", group: "Story", icon: "M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h6" },
  { id: "pipeline", label: "Data engineering", group: "Data", icon: "M4 6h6v4H4zM14 14h6v4h-6zM10 8h4v8M4 16h6" },
  { id: "quality", label: "Data quality", group: "Data", icon: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7zM8.5 12l2.5 2.5 4.5-5" },
  { id: "governance", label: "Governance", group: "Data", icon: "M4 20h16M6 20V10M10 20V10M14 20V10M18 20V10M3 10l9-6 9 6" },
  { id: "operations", label: "Digital operations", group: "Run & change", icon: "M3 12h4l2-6 4 12 2-6h6" },
  { id: "transformation", label: "Transformation", group: "Run & change", icon: "M4 17l5-5 4 4 7-8M15 8h5v5" },
  { id: "adoption", label: "Change & adoption", group: "Run & change", icon: "M8 11a3 3 0 100-6 3 3 0 000 6zM16 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3 2.5-5 5-5s5 2 5 5M13 15.5c.9-.3 2-.5 3-.5 2.5 0 5 2 5 5" },
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
    s += `<path class="draw" d="${d}" fill="none" style="stroke:${sr.color}" stroke-width="${sr.width || 2}" stroke-linejoin="round" stroke-linecap="round" ${sr.dash ? `stroke-dasharray="${sr.dash}"` : ""}/>`;
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

function gauge(value, was, cap, bandIn) {
  const band = bandIn || trustBand(value), r = 52, cx = 70, cy = 66, len = Math.PI * r;
  const p = clamp(value / 100, 0, 1), pw = clamp((was ?? 0) / 100, 0, 1);
  const ang = a => [cx - r * Math.cos(Math.PI * a), cy - r * Math.sin(Math.PI * a)];
  const [wx, wy] = ang(pw);
  const colour = band.cls === "good" ? "var(--good)" : band.cls === "warn" ? "var(--warn)" : "var(--crit)";
  return `<svg viewBox="0 0 140 84" width="100%" style="max-width:180px" role="img" aria-label="${esc(cap)} ${fmt(value, 0)} of 100">
    <path d="M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}" fill="none" style="stroke:var(--line)" stroke-width="9" stroke-linecap="round"/>
    <path class="draw" d="M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}" fill="none" style="stroke:${colour};--len:${len};stroke-dasharray:${len * p} ${len}" stroke-width="9" stroke-linecap="round"/>
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
    const big = tl.k ? fmtK(now) : fmt(now, tl.d);
    return `<div class="panel tile"><div class="lbl">${esc(tl.label)}</div>
      <div class="big num">${big}<small>${esc(tl.unit)}</small></div>
      <div>${spark(vals, "var(--s1)", 220, 36)}</div>
      <div class="foot"><span>${tl.key === "adoption" ? "weekly, all groups" : "7-day avg vs week 1"}${tl.note ? " · " + esc(tl.note) : ""}</span>${chg(now, was, tl.better, tl.d)}</div></div>`;
  }).join("");
  const moves = d.interventions.map((iv, k) => `<div class="move">
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
  const html = `
  <section class="hero">
    <div>
      <div class="eyebrow">Operational data trust platform · ${esc(cfg.label)} pack</div>
      <h1 class="h1">Field data teams can act on, at any hour</h1>
      <p class="lede">${esc(d.site)}: ${esc(d.description)} Over ${S.data.period.days} days, <b class="num">${fmtInt(t.bronze)}</b> raw records were checked against <b>${t.rules}</b> quality rules before reaching a KPI. Fixing data at source lifted trust, and adoption followed.</p>
      <div class="thesis"><b>field reality</b><i>→</i><b>trusted data</b><i>→</i><b>decisions</b><i>→</i><b>adoption</b></div>
    </div>
    <div class="hero-gauges">
      <div class="gauge-card"><div class="cap">Data trust score</div>${gauge(last7(tr), first7(tr), "Data trust score")}
        <div>${pill(trustBand(last7(tr)).cls, trustBand(last7(tr)).label)}</div><div class="delta">from ${fmt(first7(tr), 0)} in week 1</div></div>
      <div class="gauge-card"><div class="cap">Platform adoption</div>${gauge(ad.now, ad.was, "Platform adoption", adBand(ad.now))}
        <div>${pill(adBand(ad.now).cls, adBand(ad.now).label)}</div><div class="delta">from ${fmt(ad.was, 0)}% in week 1</div></div>
    </div>
  </section>
  <section class="grid g-4">${tiles}</section>
  <section class="panel">
    ${panelHead("Trust leads, adoption follows", "Data trust score (7-day rolling, daily in grey) and weekly share of target users active on the platform. Numbered markers are the programme interventions below.",
      `<div class="legend"><span><i style="background:var(--s1)"></i>Trust score, 7-day</span><span><i style="background:var(--s-muted)"></i>Daily</span><span><i style="background:var(--s3)"></i>Adoption, % of users</span><span><i class="dash"></i>Intervention</span></div>`)}
    <div class="chart" id="c-hero"></div>
  </section>
  <section class="story">${moves}</section>
  <section class="grid g-2">
    <div class="panel">${panelHead("Where the data broke", "Rule failure rate in the weeks before the first fix, and in the last three weeks.",
      `<div class="legend"><span><i class="sq" style="background:var(--s-muted)"></i>Before</span><span><i class="sq" style="background:var(--s1)"></i>Now</span></div>`)}${worstRows}
      <p class="note" style="margin:10px 0 0">See every rule and its SQL on <a href="#quality">Data quality</a>.</p></div>
    <div class="panel">${panelHead("Pipeline at a glance", `Latest run ${dLabel(lastRun.day)} · ${esc(lastRun.status)}`)}
      <div class="grid g-2" style="gap:14px">
        ${[["Raw records (bronze)", fmtInt(t.bronze)], ["Trusted records (silver)", fmtInt(t.silver)], ["Quarantined", fmtInt(t.quarantined)], ["Promoted with warnings", fmtInt(t.flagged)]]
          .map(([l, v]) => `<div class="tile"><div class="lbl">${l}</div><div class="big num" style="font-size:30px">${v}</div></div>`).join("")}
      </div>
      <p class="note" style="margin:14px 0 0">A record that breaks a blocking rule never reaches a KPI. It waits in quarantine with the rule IDs it broke, routed to a named data steward. <a href="#pipeline">Open the pipeline</a>.</p></div>
  </section>`;
  const after = () => {
    const ad7 = new Array(d.trust.length).fill(null);
    d.adoption.overall.forEach((v, w) => { const i = Math.min(d.trust.length - 1, w * 7 + 6); ad7[i] = v; });
    lineChart($("#c-hero"), {
      x: d.trust.map(t => t.day), h: 300, yMin: 20, yMax: 100, ticks: [20, 40, 60, 80, 100], band: { from: 90, to: 100, label: "Decision-grade ≥ 90" },
      series: [{ name: "Daily score", color: "var(--s-muted)", values: tr, width: 1.2, noLabel: true },
               { name: "Data trust score", color: "var(--s1)", values: roll7(tr), area: true, width: 2.4 },
               { name: "Adoption", color: "var(--s3)", values: ad7, connect: true, dots: true, width: 2.2 }],
      markers: ivMarkers(), direct: true, fmtV: v => fmt(v, 0), label: "Trust score and adoption over 90 days",
    });
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
      ${[["Data engineering", "pipeline", "Medallion pipeline, contract-driven rules, quarantine, reproducible runs"],
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
  hideTT();
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
