/* FieldTrust value-chain scenes: hand-built SVG cross-sections with SMIL motion.
   Each scene returns { w, h, svg, stages: { id: { pin, box, emit } } }.
   pin  = where the numbered label sits, box = highlight / zoom region,
   emit = where data packets leave the asset for the data layer.
   Colours come from --sc-* tokens so the scene follows the light/dark theme
   (dark = night shift with lamps on, light = day shift). */
(() => {
"use strict";
const W = 1600, H = 700, BUS = 74, HUB_X = 1452;

const f = n => Math.round(n * 10) / 10;
const anim = (attr, values, dur, extra = "") => `<animate attributeName="${attr}" values="${values}" dur="${dur}s" repeatCount="indefinite" ${extra}/>`;
const motion = (path, dur, begin = 0, extra = "") => `<animateMotion path="${path}" dur="${dur}s" begin="${f(begin)}s" repeatCount="indefinite" ${extra}/>`;
const flowDash = (d, cls, dur = 1.2, dash = "5 9") => `<path d="${d}" class="${cls}" fill="none" stroke-dasharray="${dash}">${anim("stroke-dashoffset", "28;0", dur)}</path>`;

// ------------------------------------------------------------ shared defs
function defs(id) {
  return `<defs>
  <linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sc-sky-top)"/><stop offset="1" style="stop-color:var(--sc-sky-bot)"/></linearGradient>
  <linearGradient id="${id}-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sc-sea-top)"/><stop offset="1" style="stop-color:var(--sc-sea-bot)"/></linearGradient>
  <linearGradient id="${id}-earth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sc-ground-top)"/><stop offset=".25" style="stop-color:var(--sc-ground)"/><stop offset="1" style="stop-color:var(--sc-strata2)"/></linearGradient>
  <linearGradient id="${id}-beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--sc-lamp);stop-opacity:.55"/><stop offset="1" style="stop-color:var(--sc-lamp);stop-opacity:0"/></linearGradient>
  <radialGradient id="${id}-glow"><stop offset="0" style="stop-color:var(--sc-lamp);stop-opacity:.9"/><stop offset="1" style="stop-color:var(--sc-lamp);stop-opacity:0"/></radialGradient>
  <radialGradient id="${id}-flame" cx=".5" cy=".75" r=".7"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#ffb02e"/><stop offset="1" stop-color="#e2521d" stop-opacity="0"/></radialGradient>
  <pattern id="${id}-pores" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="rgba(255,255,255,.18)"/><circle cx="6.5" cy="6" r=".8" fill="rgba(0,0,0,.25)"/></pattern>
  <pattern id="${id}-lattice" width="8" height="10" patternUnits="userSpaceOnUse"><path d="M0 0L8 10M8 0L0 10" class="sc-lattice"/></pattern>

  <g id="${id}-haul">
    <rect x="-23" y="-13" width="40" height="5" rx="1" fill="#3a3a3a"/>
    <path d="M-25 -26 L9 -26 L6 -13 L-22 -13 Z" fill="#d99a1e" stroke="#7a560f" stroke-width=".8"/>
    <path d="M9 -26 L19 -26 L19 -23 L9 -23 Z" fill="#d99a1e"/>
    <rect x="10" y="-22" width="8" height="9" rx="1" fill="#e9b13a"/><rect x="12" y="-21" width="5" height="4" fill="#20343c"/>
    <circle cx="-14" cy="-5" r="5.5" fill="#1b1b1b" stroke="#555" stroke-width="1"/><circle cx="10" cy="-5" r="5.5" fill="#1b1b1b" stroke="#555" stroke-width="1"/>
    <circle cx="-14" cy="-5" r="1.8" fill="#777"/><circle cx="10" cy="-5" r="1.8" fill="#777"/>
    <path d="M20 -16 L64 -24 L64 -4 Z" fill="url(#${id}-beam)" class="sc-night"/>
    <circle cx="19.5" cy="-15" r="1.6" class="sc-lamp"/>
  </g>
  <g id="${id}-haul-load"><use href="#${id}-haul"/><path d="M-23 -26 Q-9 -36 7 -26 Z" class="sc-coal-heap"/></g>
  <g id="${id}-road">
    <rect x="-22" y="-20" width="30" height="13" rx="1.5" fill="#4b6b78" stroke="#2c434c" stroke-width=".8"/>
    <rect x="9" y="-19" width="10" height="12" rx="2" fill="#c9cfd1"/><rect x="13" y="-17" width="5" height="5" fill="#20343c"/>
    <circle cx="-15" cy="-5" r="3.6" fill="#1b1b1b"/><circle cx="-6" cy="-5" r="3.6" fill="#1b1b1b"/><circle cx="14" cy="-5" r="3.6" fill="#1b1b1b"/>
    <path d="M20 -12 L58 -18 L58 -4 Z" fill="url(#${id}-beam)" class="sc-night"/>
    <circle cx="19.5" cy="-11" r="1.4" class="sc-lamp"/>
  </g>
  <g id="${id}-road-load"><use href="#${id}-road"/><path d="M-21 -20 Q-7 -28 7 -20 Z" class="sc-coal-heap"/></g>
  </defs>`;
}

function sky(id, ground, hills) {
  let stars = "";
  for (let i = 0; i < 46; i++) { const x = (i * 157.3) % W, y = 18 + ((i * 89.7) % (ground - 120)); stars += `<circle cx="${f(x)}" cy="${f(y)}" r="${i % 5 ? .8 : 1.3}" class="sc-star">${i % 4 ? "" : anim("opacity", ".2;1;.2", 3 + (i % 5))}</circle>`; }
  return `<rect width="${W}" height="${ground + 2}" fill="url(#${id}-sky)"/>
  <g class="sc-night">${stars}<circle cx="1290" cy="150" r="17" class="sc-moon"/><circle cx="1297" cy="145" r="15" style="fill:var(--sc-sky-top)" opacity=".85"/></g>
  <g class="sc-day"><circle cx="1290" cy="150" r="22" class="sc-sun"/></g>
  <path d="${hills[0]}" class="sc-hill2"/><path d="${hills[1]}" class="sc-hill"/>`;
}

function bus() {
  return `<g class="sc-bus">
    <path d="M24 ${BUS} H${HUB_X}" class="sc-bus-line"/>
    ${flowDash(`M24 ${BUS} H${HUB_X}`, "sc-bus-flow", 1.4, "3 11")}
    <text x="28" y="${BUS - 12}" class="sc-bus-label">DATA LAYER · OT → IT</text>
    <g transform="translate(${HUB_X},${BUS - 34})">
      <rect width="136" height="68" rx="9" class="sc-hub"/>
      <text x="68" y="24" text-anchor="middle" class="sc-hub-t">FIELDTRUST</text>
      <text x="68" y="40" text-anchor="middle" class="sc-hub-s">bronze → silver → gold</text>
      <g transform="translate(26,48)"><rect width="24" height="8" rx="2" class="sc-hub-b"/><rect x="31" width="24" height="8" rx="2" class="sc-hub-s2"/><rect x="62" width="24" height="8" rx="2" class="sc-hub-g"/></g>
      <rect width="136" height="68" rx="9" class="sc-hub-pulse" fill="none">${anim("opacity", "0;.9;0", 2.4)}</rect>
    </g>
  </g>`;
}

function packet(type, cls = "") {
  if (type === "time-series") return `<circle r="4.2" class="pk pk-ts ${cls}"/>`;
  if (type === "event") return `<rect x="-3.8" y="-3.8" width="7.6" height="7.6" rx="1" class="pk pk-ev ${cls}"/>`;
  if (type === "document") return `<path d="M-3.5 -5 H2 L4 -3 V5 H-3.5 Z" class="pk pk-doc ${cls}"/>`;
  return `<path d="M0 -5 L5 0 L0 5 L-5 0 Z" class="pk pk-geo ${cls}"/>`;
}
// packets rise from the asset to the bus and ride it to the hub
// Packet rate follows the fastest data stream at each stage, on a log scale:
// a 1 s historian floods the data layer, a yearly model barely trickles.
function emitters(stages, vc) {
  let s = "";
  Object.entries(stages).forEach(([id, st], k) => {
    const [x, y] = st.emit, items = ((vc.find(v => v.id === id) || {}).data || [{ type: "event", period_s: 3600 }]).slice().sort((a, b) => a.period_s - b.period_s);
    const path = `M${x} ${y} V${BUS} H${HUB_X}`;
    const len = (y - BUS) + (HUB_X - x), travel = len / 120;
    const gap = .45 + 1.2 * Math.log10(Math.max(1, items[0].period_s));
    const cycle = Math.max(travel, gap), n = Math.max(1, Math.min(14, Math.round(cycle / gap)));
    const kt = f(travel / cycle * 1000) / 1000, ring = Math.min(6, Math.max(1.2, gap));
    s += `<g class="sc-emit" data-stage="${id}"><circle cx="${x}" cy="${y}" r="5" class="sc-emit-ring">${anim("r", "4;16", f(ring), `begin="${f(k * .3)}s"`)}${anim("opacity", ".9;0", f(ring), `begin="${f(k * .3)}s"`)}</circle>`;
    for (let i = 0; i < n; i++) {
      const it = i % 3 === 2 ? items[(Math.floor(i / 3) + 1) % items.length] : items[0];
      const b = k * .37 + i * cycle / n;
      s += `<g opacity="0">${packet(it.type)}${motion(path, f(cycle), b, kt < 1 ? `keyPoints="0;1;1" keyTimes="0;${kt};1" calcMode="linear"` : "")}${anim("opacity", "0;1;1;0;0", f(cycle), `begin="${f(b)}s" keyTimes="0;${f(kt * .06 * 1000) / 1000};${f(kt * .94 * 1000) / 1000};${kt};1"`)}</g>`;
    }
    s += `</g>`;
  });
  return s;
}

function light(id, x, y, r = 12) { return `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${id}-glow)" class="sc-night"/><circle cx="${x}" cy="${y}" r="1.7" class="sc-lamp"/>`; }
function tree(x, y, s = 1) { return `<g transform="translate(${x},${y}) scale(${s})"><rect x="-1" y="-8" width="2" height="8" class="sc-trunk"/><path d="M0 -26 L7 -8 L-7 -8 Z" class="sc-veg"/><path d="M0 -32 L5 -18 L-5 -18 Z" class="sc-veg"/></g>`; }
function tag(x, y, text, anchor = "middle") { return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="sc-tag">${text}</text>`; }
function breakMark(x, y, label) { return `<g class="sc-break"><path d="M${x - 8} ${y + 9} L${x - 2} ${y - 9} M${x + 2} ${y + 9} L${x + 8} ${y - 9}"/>${tag(x, y - 16, label)}</g>`; }

// ============================================================ MINING
function mining(vc = []) {
  const id = "mn", G = 380;
  const stages = {
    pit:      { pin: [190, 300], box: [20, 290, 330, 290], emit: [222, 470], hand: [352, 366] },
    rom:      { pin: [440, 300], box: [345, 300, 190, 110], emit: [452, 345], hand: [528, 366] },
    hauling:  { pin: [700, 300], box: [535, 290, 330, 120], emit: [712, 336], hand: [866, 366] },
    port:     { pin: [960, 300], box: [868, 300, 190, 110], emit: [985, 340], hand: [1062, 322] },
    crushing: { pin: [1162, 250], box: [1060, 240, 190, 170], emit: [1162, 300], hand: [1252, 286] },
    shipment: { pin: [1440, 300], box: [1250, 290, 350, 160], emit: [1350, 368], hand: [1590, 352] },
  };
  const hills = ["M0 300 Q120 230 260 270 T560 250 T900 262 T1250 238 T1600 262 V382 H0 Z", "M0 336 Q160 296 330 322 T700 312 T1050 318 T1300 300 V382 H0 Z"];

  // pit geometry: benches stepping down to the coal seam
  const pitPath = "M24 380 H44 L56 408 H84 L96 436 H124 L136 464 H160 L172 494 H262 L274 466 H292 L304 438 H318 L330 410 H340 L352 380";
  const ramp = "M222 494 L274 466 H292 L304 438 H318 L330 410 H340 L352 380 L470 380";
  const rampBack = "M470 380 L352 380 L340 410 H330 L318 438 H304 L292 466 H274 L236 494";
  const haulRoad = "M520 380 H868";
  let s = defs(id) + sky(id, G, hills);
  // ground and strata
  s += `<path d="M0 380 ${pitPath.slice(1).replace(/^24 380/, "L24 380")} H1270 V700 H0 Z" fill="url(#${id}-earth)"/>`;
  s += `<path d="${pitPath} Z" class="sc-pit-wall"/>`;
  [394, 422, 450, 480].forEach((y, k) => { s += `<path d="M${50 + k * 26} ${y} H${346 - k * 22}" class="sc-pit-bench"/>`; });
  s += `<rect x="0" y="378" width="30" height="7" class="sc-topsoil"/><rect x="350" y="378" width="920" height="7" class="sc-topsoil"/>`;
  s += `<path d="M0 520 Q300 506 640 524 T1290 516" class="sc-strata-line"/><path d="M0 600 Q380 588 760 606 T1290 596" class="sc-strata-line"/>`;
  // coal seam exposed in pit floor and running under the ground
  s += `<path d="M0 498 Q90 494 172 494 H262 Q420 496 640 506 T1290 512 V530 Q900 524 640 524 T262 512 H172 Q80 512 0 516 Z" class="sc-seam"/>`;
  s += `<path d="M172 494 H262 L268 500 H166 Z" class="sc-seam-face"/>`;
  s += `<path d="${pitPath}" class="sc-bench-edge" fill="none"/>`;
  s += tag(110, 560, "COAL SEAM") + tag(660, 560, "OVERBURDEN · INTERBURDEN") ;
  // trees on the rim and behind
  [8, 380, 400, 520, 548, 860, 1240].forEach((x, i) => { s += tree(x, G, .8 + (i % 3) * .15); });

  // drill rig on upper bench + blast pattern
  s += `<g transform="translate(70,408)"><rect x="-10" y="-7" width="22" height="7" rx="2" fill="#5a6064"/><rect x="-6" y="-14" width="12" height="7" fill="#d99a1e"/><rect x="0" y="-42" width="3" height="30" fill="#c9cfd1"/>${light(id, 1.5, -44, 10)}</g>`;
  s += [100, 110, 120].map(x => `<circle cx="${x}" cy="434" r="1.6" class="sc-blast"/>`).join("");
  // excavator loading at the seam
  s += `<g transform="translate(196,494)"><rect x="-18" y="-8" width="34" height="8" rx="4" fill="#2b2b2b"/><rect x="-14" y="-22" width="26" height="14" rx="2" fill="#d99a1e"/><rect x="4" y="-30" width="8" height="8" fill="#e9b13a"/>
    <g>${`<animateTransform attributeName="transform" type="rotate" values="0 8 -20;-14 8 -20;0 8 -20" dur="5s" repeatCount="indefinite"/>`}<path d="M8 -20 L34 -44 L46 -22" fill="none" stroke="#c78a17" stroke-width="5" stroke-linecap="round"/><path d="M42 -24 L52 -18 L46 -10 L38 -16 Z" fill="#555"/></g>${light(id, 10, -32, 12)}</g>`;
  s += `<use href="#${id}-haul" transform="translate(240,494) scale(-1,1)"/>`;
  // ROM stockpiles + loader
  s += `<path d="M360 380 Q392 330 428 380 Z" class="sc-pile"/><path d="M420 380 Q456 322 496 380 Z" class="sc-pile"/><path d="M486 380 Q506 352 526 380 Z" class="sc-pile"/>`;
  s += `<g transform="translate(508,380)"><rect x="-10" y="-9" width="18" height="7" rx="2" fill="#d99a1e"/><circle cx="-6" cy="-3" r="3.2" fill="#222"/><circle cx="5" cy="-3" r="3.2" fill="#222"/><rect x="-14" y="-12" width="5" height="6" fill="#777"/></g>`;
  s += light(id, 440, 300, 16) + `<rect x="439" y="302" width="2" height="78" class="sc-pole"/>`;
  s += tag(440, 398, "ROM PAD");
  // haul trucks: loaded up the ramp, empty back down
  [0, 6.5, 13].forEach(b => { s += `<g><use href="#${id}-haul-load"/>${motion(ramp, 19.5, b, 'rotate="auto"')}</g>`; });
  [3, 9.5, 16].forEach(b => { s += `<g><use href="#${id}-haul" transform="scale(-1,1)"/>${motion(rampBack, 19.5, b, 'rotate="auto-reverse"')}</g>`; });

  // haul road with WIM bridge and fatigue camera
  s += `<rect x="520" y="378" width="348" height="5" class="sc-road"/>${flowDash("M520 380.5 H868", "sc-road-mark", 3, "10 14")}`;
  s += breakMark(620, 362, "~ 60 KM");
  s += `<g transform="translate(712,380)"><rect x="-24" y="-3" width="48" height="4" class="sc-wim"/><path d="M-24 -46 V0 M24 -46 V0 M-26 -46 H26" class="sc-gantry" fill="none"/><rect x="-14" y="-56" width="28" height="11" rx="2" class="sc-sign"/><text x="0" y="-48" text-anchor="middle" class="sc-sign-t">WIM</text>${light(id, -24, -46, 10)}${light(id, 24, -46, 10)}</g>`;
  [0, 4.2, 8.4, 12.6].forEach(b => { s += `<g><use href="#${id}-road-load"/>${motion("M532 380 H880", 16.8, b, 'rotate="auto"')}</g>`; });
  s += `<g><g transform="translate(0,-26)"><circle r="7" class="sc-fatigue">${anim("opacity", ".25;.9;.25", 1.6)}</circle><path d="M-4 0 Q0 -4 4 0 Q0 4 -4 0 Z" class="sc-eye"/></g>${motion("M532 380 H880", 16.8, 2.1)}</g>`;
  s += tag(790, 398, "HAUL ROAD · NIGHT SHIFT", "middle");

  // port: hopper, stockpiles, stacker
  s += `<rect x="868" y="378" width="400" height="6" class="sc-concrete"/>`;
  s += `<path d="M880 352 H912 L904 378 H888 Z" class="sc-steel"/><rect x="884" y="346" width="24" height="6" class="sc-steel-2"/>`;
  s += `<path d="M920 380 Q955 322 992 380 Z" class="sc-pile"/><path d="M980 380 Q1016 330 1052 380 Z" class="sc-pile"/>`;
  s += `<g transform="translate(1000,378)"><rect x="-6" y="-14" width="12" height="14" class="sc-steel-2"/><path d="M0 -14 L-44 -58" class="sc-boom"/>${flowDash("M0 -14 L-44 -58", "sc-coal-flow", .9)}</g>`;
  s += light(id, 960, 300, 16) + `<rect x="959" y="302" width="2" height="76" class="sc-pole"/>` + tag(968, 398, "PORT STOCKYARD");
  // conveyor from hopper to crusher, crusher building, conveyor to barge loader
  const c1 = "M904 370 L1100 286", c2 = "M1196 300 L1330 300";
  s += `<path d="${c1}" class="sc-conveyor"/>${flowDash(c1, "sc-coal-flow", 1)}`;
  [960, 1020, 1080].forEach(x => { const y = 370 - (x - 904) * 84 / 196; s += `<path d="M${x} ${f(y)} V378" class="sc-leg"/>`; });
  s += `<g><rect x="1100" y="262" width="96" height="116" class="sc-plant"/><path d="M1096 262 L1148 236 L1200 262 Z" class="sc-roof"/>
     <rect x="1112" y="280" width="20" height="14" class="sc-win"/><rect x="1142" y="280" width="20" height="14" class="sc-win"/><rect x="1172" y="280" width="14" height="14" class="sc-win"/>
     <rect x="1128" y="318" width="40" height="40" rx="3" class="sc-steel-2"/><g transform="translate(1148,338)"><circle r="12" class="sc-steel"/><path d="M-12 0 H12 M0 -12 V12" class="sc-rotor"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2s" repeatCount="indefinite"/></path></g>
     <text x="1148" y="374" text-anchor="middle" class="sc-tag">CRUSHER</text>${light(id, 1148, 248, 14)}</g>`;
  s += `<path d="${c2}" class="sc-conveyor"/>${flowDash(c2, "sc-coal-flow", .8)}<path d="M1240 300 V378 M1290 300 V384" class="sc-leg"/>`;
  s += `<g transform="translate(1330,300)"><rect x="-4" y="-8" width="10" height="10" class="sc-steel-2"/><path d="M6 -4 L34 72" class="sc-boom"/>${flowDash("M6 -4 L34 72", "sc-coal-flow", .6, "4 6")}</g>`;
  // sea, barge being loaded, tug + barge to vessel, floating crane, ocean vessel
  s += `<rect x="1268" y="384" width="332" height="316" fill="url(#${id}-sea)"/><rect x="1262" y="378" width="8" height="40" class="sc-concrete"/>`;
  s += waves(1268, 1600, 392);
  s += `<g transform="translate(1366,396)"><path d="M-42 -6 H40 L34 6 H-36 Z" class="sc-barge"/><path d="M-36 -6 Q-2 -24 32 -6 Z" class="sc-coal-heap">${anim("d", "M-36 -6 Q-2 -12 32 -6 Z;M-36 -6 Q-2 -24 32 -6 Z;M-36 -6 Q-2 -24 32 -6 Z", 8)}</path></g>`;
  s += `<g>${motion("M1310 430 H1468", 22, 0, 'keyPoints="0;1;1" keyTimes="0;.85;1" calcMode="linear"')}<path d="M-40 -6 H38 L32 6 H-34 Z" class="sc-barge"/><path d="M-34 -6 Q-2 -22 30 -6 Z" class="sc-coal-heap"/><path d="M-40 0 H-54" class="sc-tow"/><g transform="translate(-66,0)"><path d="M-14 -4 H12 L8 6 H-10 Z" class="sc-tug"/><rect x="-6" y="-12" width="10" height="8" class="sc-tug-cab"/>${light(id, 0, -13, 8)}</g></g>`;
  s += `<g transform="translate(1528,404)"><path d="M-74 -22 H70 L62 14 H-66 Z" class="sc-hull"/><rect x="-74" y="-22" width="144" height="6" class="sc-hull-band"/>
     <rect x="44" y="-50" width="22" height="28" class="sc-bridge"/><rect x="48" y="-46" width="14" height="4" class="sc-win"/>
     ${[-50, -20, 10].map(x => `<path d="M${x} -22 V-44 L${x + 18} -36" class="sc-crane" fill="none"/>`).join("")}${light(id, 56, -52, 10)}
     <text x="-4" y="6" text-anchor="middle" class="sc-tag-ink">MV CORAL WREN</text></g>`;
  s += `<g transform="translate(1468,412)"><rect x="-16" y="-6" width="32" height="10" class="sc-barge"/><path d="M-6 -6 L4 -40 L22 -30" class="sc-crane" fill="none"/></g>`;
  s += tag(1430, 470, "ANCHORAGE · TRANS-SHIPMENT");
  s += bus() + emitters(stages, vc);
  return { w: W, h: 600, svg: s, stages };
}

function waves(x0, x1, y) {
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1 + 40; x += 20) d += ` q5 -3 10 0 t10 0`;
  return `<path d="${d}" class="sc-wave"><animateTransform attributeName="transform" type="translate" values="0 0;-20 0" dur="2.4s" repeatCount="indefinite"/></path>
          <path d="${d}" class="sc-wave" opacity=".5" transform="translate(0,14)"><animateTransform attributeName="transform" type="translate" values="-10 14;-30 14" dur="3.2s" repeatCount="indefinite"/></path>`;
}

// ============================================================ OIL & GAS
function oilGas(vc = []) {
  const id = "og", G = 330;
  const stages = {
    reservoir:       { pin: [470, 610], box: [60, 470, 520, 200], emit: [300, 560], hand: [322, 536] },
    well:            { pin: [392, 255], box: [320, 250, 120, 330], emit: [360, 312], hand: [452, 298] },
    "drilling-pipe": { pin: [104, 470], box: [60, 320, 250, 250], emit: [176, 420], hand: [150, 300] },
    rig:             { pin: [96, 150], box: [70, 130, 210, 205], emit: [176, 184], hand: [262, 318] },
    processing:      { pin: [720, 168], box: [580, 160, 290, 180], emit: [700, 240], hand: [862, 282] },
    gts:             { pin: [1000, 250], box: [870, 240, 260, 130], emit: [1000, 300], hand: [1128, 286] },
    terminal:        { pin: [1196, 194], box: [1120, 214, 170, 130], emit: [1200, 268], hand: [1290, 286] },
    export:          { pin: [1336, 228], box: [1290, 222, 110, 125], emit: [1336, 290], hand: [1404, 316] },
    vessel:          { pin: [1505, 280], box: [1400, 270, 200, 150], emit: [1505, 344], hand: [1590, 330] },
  };
  const hills = ["M0 250 Q140 200 300 236 T640 224 T980 238 T1300 214 T1600 236 V332 H0 Z", "M0 290 Q180 258 380 280 T760 270 T1100 276 T1380 262 V332 H0 Z"];
  let s = defs(id) + sky(id, G, hills);

  // earth with strata and the reservoir trap
  s += `<rect x="0" y="${G}" width="1380" height="${H - G}" fill="url(#${id}-earth)"/><rect x="0" y="${G}" width="1380" height="6" class="sc-topsoil"/>`;
  s += `<path d="M0 410 Q320 396 700 414 T1380 404" class="sc-strata-line"/><path d="M0 468 Q300 440 560 470 T1380 462" class="sc-strata-line"/>`;
  // anticline: cap rock, gas cap, condensate leg, water
  s += `<path d="M40 640 Q300 470 580 640 Z" class="sc-water-zone"/>`;
  s += `<path d="M70 620 Q300 480 550 620 Z" class="sc-oil-zone"/>`;
  s += `<path d="M110 596 Q300 494 510 596 Z" class="sc-gas-zone"/>`;
  s += `<path d="M40 640 Q300 470 580 640 Z" fill="url(#${id}-pores)"/>`;
  s += `<path d="M20 640 Q300 448 600 640 L580 640 Q300 470 40 640 Z" class="sc-cap"/>`;
  s += `<path d="M20 640 Q300 448 600 640" class="sc-cap-edge" fill="none"/>`;
  s += tag(232, 562, "GAS CAP") + tag(300, 604, "CONDENSATE") + tag(300, 632, "AQUIFER") + tag(520, 520, "CAP ROCK");
  // reservoir fluid shimmer
  s += `<path d="M150 580 Q300 512 470 580" class="sc-shimmer" fill="none" stroke-dasharray="4 10">${anim("stroke-dashoffset", "0;-28", 2.5)}</path>`;
  [12, 520, 560, 610, 1100].forEach((x, i) => { s += tree(x, G, .75 + (i % 3) * .15); });

  // drilling rig + drill string (a new well being drilled)
  const RX = 176;
  s += `<g><path d="M${RX - 26} 304 L${RX - 6} 176 H${RX + 6} L${RX + 26} 304 Z" fill="url(#${id}-lattice)"/><path d="M${RX - 26} 304 L${RX - 6} 176 M${RX + 26} 304 L${RX + 6} 176 M${RX - 8} 176 H${RX + 8}" class="sc-derrick" fill="none"/>
    <rect x="${RX - 9}" y="168" width="18" height="9" class="sc-steel-2"/>
    <g><rect x="${RX - 5}" y="200" width="10" height="14" rx="1" fill="#d99a1e">${anim("y", "196;232;196", 9)}</rect></g>
    <rect x="${RX - 46}" y="304" width="92" height="9" class="sc-steel"/><rect x="${RX - 40}" y="313" width="8" height="17" class="sc-steel-2"/><rect x="${RX + 32}" y="313" width="8" height="17" class="sc-steel-2"/>
    <rect x="${RX + 46}" y="292" width="34" height="20" class="sc-plant"/><rect x="${RX + 50}" y="296" width="9" height="6" class="sc-win"/>
    <rect x="${RX - 92}" y="316" width="40" height="14" class="sc-tank-low"/><rect x="${RX + 84}" y="318" width="44" height="12" class="sc-pipe-rack"/>
    ${light(id, RX - 6, 176, 14)}${light(id, RX + 6, 230, 10)}${light(id, RX - 30, 300, 12)}${light(id, RX + 30, 300, 12)}
    <text x="${RX - 72}" y="346" class="sc-tag" text-anchor="middle">MUD PITS</text></g>`;
  const ds = `M${RX} 313 V430 Q${RX} 486 ${RX + 54} 520`;
  s += `<path d="${ds}" class="sc-borehole" fill="none"/><path d="${ds}" class="sc-drillpipe" fill="none"/>`;
  s += `<path d="${ds}" class="sc-drill-rot" fill="none" stroke-dasharray="3 5">${anim("stroke-dashoffset", "0;-16", .5)}</path>`;
  s += `<g transform="translate(${RX + 54},520) rotate(33)"><path d="M-4 -6 H4 L0 6 Z" class="sc-bit"><animateTransform attributeName="transform" type="rotate" values="-12;12;-12" dur=".4s" repeatCount="indefinite"/></path></g>`;
  // MWD mud-pulse telemetry travelling up the string
  [0, 1.3, 2.6].forEach(b => { s += `<g opacity="0"><circle r="3" class="sc-pulse"/>${motion(ds, 3.9, b, 'keyPoints="1;0" keyTimes="0;1" calcMode="linear"')}${anim("opacity", "0;1;1;0", 3.9, `begin="${b}s" keyTimes="0;.1;.85;1"`)}</g>`; });
  s += tag(RX + 70, 452, "MWD / LWD", "start");

  // producing well: wellbore, casing, christmas tree
  const WX = 360, wb = `M${WX} ${G} V470 Q${WX} 520 ${WX - 46} 566`;
  s += `<path d="${wb}" class="sc-casing" fill="none"/><path d="${wb}" class="sc-tubing" fill="none"/>`;
  [0, 1.1, 2.2, 3.3].forEach(b => { s += `<g opacity="0"><circle r="2.6" class="sc-gas-dot"/>${motion(wb, 4.4, b, 'keyPoints="1;0" keyTimes="0;1" calcMode="linear"')}${anim("opacity", "0;1;1;0", 4.4, `begin="${b}s" keyTimes="0;.1;.9;1"`)}</g>`; });
  s += `<g transform="translate(${WX},${G})"><rect x="-7" y="-10" width="14" height="10" class="sc-tree"/><rect x="-4" y="-26" width="8" height="16" class="sc-tree"/><rect x="-12" y="-20" width="24" height="5" class="sc-tree"/><circle cx="-12" cy="-17.5" r="3" class="sc-valve"/><circle cx="12" cy="-17.5" r="3" class="sc-valve"/><rect x="-5" y="-30" width="10" height="4" class="sc-tree"/></g>`;
  s += tag(WX - 26, 300, "WELLHEAD", "end");
  // flowline to processing
  const fl = `M${WX + 12} 312.5 H${560} Q575 312 590 300 H620`;
  s += `<path d="${fl}" class="sc-pipe"/>${flowDash(fl, "sc-gas-flow", 1)}`;

  // processing facility
  s += `<rect x="590" y="324" width="290" height="8" class="sc-concrete"/>`;
  s += `<g><rect x="610" y="288" width="64" height="20" rx="10" class="sc-vessel"/><rect x="618" y="308" width="6" height="16" class="sc-leg2"/><rect x="660" y="308" width="6" height="16" class="sc-leg2"/>
    <rect x="690" y="200" width="18" height="124" rx="8" class="sc-vessel"/><rect x="716" y="226" width="14" height="98" rx="7" class="sc-vessel"/>
    <rect x="742" y="270" width="64" height="54" class="sc-plant"/><path d="M738 270 L774 252 L810 270 Z" class="sc-roof"/><rect x="752" y="284" width="14" height="10" class="sc-win"/><rect x="782" y="284" width="14" height="10" class="sc-win"/>
    <path d="M674 298 H690 M708 310 H716 M730 300 H742 M806 296 H850" class="sc-pipe-thin"/>
    ${flowDash("M674 298 H690 M730 300 H742 M806 296 H850", "sc-gas-flow", .8, "3 6")}
    <rect x="828" y="300" width="20" height="24" rx="4" class="sc-steel-2"/>
    <rect x="848" y="150" width="6" height="174" class="sc-flare"/><path d="M846 150 H856" class="sc-derrick"/>
    <g transform="translate(851,146)"><ellipse rx="10" ry="20" cy="-14" fill="url(#${id}-flame)">${anim("ry", "18;24;16;22;18", 1.3)}${anim("rx", "9;12;8;11;9", 1.1)}</ellipse><circle r="34" cy="-12" fill="url(#${id}-glow)" class="sc-night" opacity=".5"/></g>
    ${light(id, 699, 196, 12)}${light(id, 723, 222, 10)}${light(id, 774, 250, 10)}
    <text x="642" y="282" text-anchor="middle" class="sc-tag">SEPARATOR</text><text x="776" y="342" text-anchor="middle" class="sc-tag">COMPRESSION · DEHYDRATION</text></g>`;

  // gas transmission system: buried trunk line, compressor station, pig trap
  const gts = "M850 296 Q870 296 872 312 V344 H1130 V300";
  s += `<path d="M872 336 H1130 V352 H872 Z" class="sc-trench"/>`;
  s += `<path d="${gts}" class="sc-pipe-big"/>${flowDash(gts, "sc-gas-flow", 1.1, "4 10")}`;
  s += breakMark(930, 318, "~ 120 KM");
  s += `<g transform="translate(1000,330)"><rect x="-32" y="-34" width="64" height="34" class="sc-plant"/><path d="M-36 -34 L0 -50 L36 -34 Z" class="sc-roof"/><rect x="-22" y="-24" width="12" height="9" class="sc-win"/><rect x="10" y="-24" width="12" height="9" class="sc-win"/><path d="M0 0 V14" class="sc-pipe-thin"/>${light(id, 0, -52, 12)}<text y="26" text-anchor="middle" class="sc-tag">COMPRESSOR STATION</text></g>`;
  [900, 1070, 1110].forEach(x => { s += `<rect x="${x - 1.5}" y="316" width="3" height="14" class="sc-marker"/><rect x="${x - 4}" y="312" width="8" height="5" class="sc-marker-top"/>`; });
  s += `<g transform="translate(1090,330)"><rect x="-12" y="-12" width="24" height="10" rx="5" class="sc-steel"/><text y="-18" text-anchor="middle" class="sc-tag">PIG TRAP</text></g>`;

  // terminal: liquefaction train, LNG full-containment tank, condensate tank
  s += `<rect x="1120" y="324" width="260" height="8" class="sc-concrete"/>`;
  s += `<g><rect x="1136" y="246" width="20" height="78" class="sc-coldbox"/><rect x="1136" y="246" width="20" height="5" class="sc-tank-band"/>
    <rect x="1160" y="276" width="30" height="48" class="sc-steel-2"/>${[0, 1, 2].map(k => `<rect x="${1162 + k * 9}" y="270" width="7" height="6" class="sc-fan"/>`).join("")}
    ${[0, 1, 2].map(k => `<circle cx="${1165.5 + k * 9}" cy="268" r="3" class="sc-fan-blade"><animateTransform attributeName="transform" type="rotate" from="0 ${1165.5 + k * 9} 268" to="360 ${1165.5 + k * 9} 268" dur="${.8 + k * .15}s" repeatCount="indefinite"/></circle>`).join("")}
    <path d="M1146 246 V236" class="sc-pipe-thin"/>${light(id, 1146, 234, 10)}</g>`;
  s += `<g><rect x="1196" y="282" width="56" height="42" class="sc-tank"/><path d="M1196 282 Q1224 262 1252 282 Z" class="sc-tank-top"/><rect x="1196" y="300" width="56" height="3" class="sc-tank-band"/><text x="1224" y="318" text-anchor="middle" class="sc-tag-dark">LNG</text></g>`;
  s += `<g><rect x="1260" y="292" width="22" height="32" class="sc-tank"/><ellipse cx="1271" cy="292" rx="11" ry="3.5" class="sc-tank-top"/></g>`;
  s += `<path d="M1130 300 H1136 M1156 300 H1160 M1190 300 H1196" class="sc-pipe-thin"/>${flowDash("M1130 300 H1136 M1156 300 H1160 M1190 300 H1196", "sc-lng-flow", .9, "3 5")}${light(id, 1224, 262, 12)}` + tag(1200, 346, "LIQUEFACTION · LNG STORAGE");

  // export metering station + jetty
  s += `<g transform="translate(1336,330)"><rect x="-30" y="-34" width="60" height="34" class="sc-plant"/><rect x="-30" y="-34" width="60" height="7" class="sc-fiscal"/><text y="-28.5" text-anchor="middle" class="sc-sign-t">FISCAL METER</text>
    ${[-18, -4, 10].map(x => `<rect x="${x}" y="-20" width="9" height="14" rx="2" class="sc-meter"/>`).join("")}<circle cx="23" cy="-14" r="3" class="sc-valve"/>${light(id, 0, -40, 12)}</g>`;
  s += `<path d="M1282 304 H1306 M1366 312 H1430" class="sc-pipe-thin"/>${flowDash("M1366 312 H1430", "sc-lng-flow", .7, "3 6")}`;
  // sea, jetty, LNG carrier
  s += `<rect x="1380" y="340" width="220" height="360" fill="url(#${id}-sea)"/>` + waves(1380, 1600, 348);
  s += `<rect x="1370" y="330" width="80" height="6" class="sc-concrete"/>${[1390, 1420, 1446].map(x => `<rect x="${x}" y="336" width="3" height="40" class="sc-leg"/>`).join("")}`;
  s += `<g transform="translate(1430,330)"><path d="M0 0 V-34 L22 -22 V0" class="sc-arm" fill="none"/>${light(id, 0, -36, 10)}</g>`;
  s += `<g transform="translate(1520,372)"><g>${`<animateTransform attributeName="transform" type="translate" values="0 0;0 2;0 0" dur="4s" repeatCount="indefinite"/>`}
    <path d="M-72 -16 H74 L64 18 H-64 Z" class="sc-hull"/><rect x="-72" y="-16" width="146" height="6" class="sc-hull-band"/>
    ${[-48, -18, 12, 42].map(x => `<path d="M${x - 13} -16 A13 13 0 0 1 ${x + 13} -16 Z" class="sc-dome"/>`).join("")}
    <rect x="56" y="-40" width="16" height="24" class="sc-bridge"/><rect x="59" y="-36" width="10" height="4" class="sc-win"/>${light(id, 64, -42, 10)}
    <text x="0" y="8" text-anchor="middle" class="sc-tag-ink">LNG · MT HARBOUR KITE</text></g></g>`;
  s += bus() + emitters(stages, vc);
  return { w: W, h: H, svg: s, stages };
}

window.FTScenes = { oil_gas: oilGas, mining };
})();
