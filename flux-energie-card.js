/**
 * flux-energie-card v0.9.3
 * Hub-and-spoke energy flow visualization for Home Assistant.
 * Five fixed nodes (Solar / Import / Export / Cumulus / EV) around a central
 * Maison ring showing autarky %. Optional 6th box (Box+) supports a Battery
 * mode with auto-detected charge/discharge direction, SoC % and daily ↑/↓ kWh.
 * Includes a UI editor (no YAML required).
 *
 * v0.9.0 forum-driven additions (post 79568):
 *   • background color customization (config.background)
 *   • per-node tap_action / hold_action with full HA action schema
 *   • mobile scroll-vs-tap disambiguation (touchmove > 10px cancels press)
 *
 * v0.9.1 layout extension:
 *   • optional 7th box "Box++" at bottom-center (between Voiture and Export),
 *     wired via extra2_w / extra2_kwh entities and config.extra2 (label/icon/
 *     color). Keeps the existing Box+ slot (mid-right) reserved for batteries.
 */

import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit-element@2.5.1/lit-element.js?module";
import { unsafeHTML as _unsafeHTML } from "https://unpkg.com/lit-html@1.4.1/directives/unsafe-html.js?module";

const VERSION = "0.9.3";

console.info(
  `%c FLUX-ENERGIE-CARD %c ${VERSION} `,
  "color: white; background: #8B5CF6; font-weight: 700;",
  "color: #8B5CF6; background: white; font-weight: 700;"
);

const ENTITY_KEYS = [
  ["pv_production",       "Production PV (W)",                "sensor"],
  ["house_consumption",   "Consommation maison (W)",          "sensor"],
  ["grid_import",         "Import réseau (W)",                "sensor"],
  ["grid_export",         "Export réseau (W)",                "sensor"],
  ["pvrouter_surplus",    "Surplus PV-router (W)",            "sensor"],
  ["ev_charger_power",    "Wallbox puissance (W)",            "sensor"],
  ["pv_daily_kwh",        "PV journalier (kWh)",              "sensor"],
  ["house_daily_kwh",     "Conso maison journalière (kWh)",   "sensor"],
  ["grid_daily_export",   "Export journalier (kWh)",          "sensor"],
  ["grid_daily_import",   "Import journalier (kWh)",          "sensor"],
  ["pvrouter_daily",      "PV-router journalier (kWh)",       "sensor"],
  ["ev_daily",            "EV chargé journalier (kWh)",       "sensor"],
];

const EXTRA_ENTITY_KEYS = [
  ["extra_w",             "Box additionnelle — puissance (W, signée si batterie)", "sensor"],
  ["extra_kwh",           "Box additionnelle — énergie (kWh)",                     "sensor"],
  ["extra_charge_w",      "Batterie — charge (W)",                                 "sensor"],
  ["extra_discharge_w",   "Batterie — décharge (W)",                               "sensor"],
  ["extra_soc",           "Batterie — état de charge (%)",                         "sensor"],
  ["extra_charged_kwh",   "Batterie — chargé journalier (kWh)",                    "sensor"],
  ["extra_discharged_kwh","Batterie — déchargé journalier (kWh)",                  "sensor"],
];

const DEFAULT_COLORS = {
  solaire:  "245,158,11",   // amber
  import:   "244,63,94",    // rose
  export:   "16,185,129",   // emerald
  cumulus:  "14,165,233",   // sky
  voiture:  "139,92,246",   // violet
  extra:    "100,116,139",  // slate (default for optional 6th box)
};

const ICONS = {
  solaire: "mdi:solar-power",
  import:  "mdi:transmission-tower",
  export:  "mdi:lightning-bolt-outline",
  cumulus: "mdi:water-boiler",
  voiture: "mdi:car-electric",
  maison:  "mdi:home",
  extra:   "mdi:battery",
};

const DEFAULT_EXTRA = {
  type: "mono",                     // "mono" | "battery"
  label: "EXTRA",
  icon: "mdi:battery",
  color: "100,116,139",             // base color (mono mode + battery inactive fallback)
  charge_color: "16,185,129",       // emerald — used in battery mode when charging
  discharge_color: "168,85,247",    // violet — used in battery mode when discharging
};

const DEFAULT_FONTS = {
  w_label_line: 25,  // W labels on lines (between boxes)
  w_value:      26,  // box W value (Maison scales auto: ×38/26)
  kwh_value:    15,  // box kWh value (Maison scales auto: ×18/15)
};

const DEFAULT_FLOW_STYLE = {
  active_opacity: 1.0,
  inactive_opacity: 0.45,
  active_stroke_width: 4,
  inactive_stroke_width: 2.5,
  active_dasharray: "7 9",
  inactive_dasharray: "7 9",
  inactive_color_mix: 100,
};

const NODE_KEYS = ["solaire", "import", "export", "cumulus", "voiture"];

const DEFAULT_LABELS = {
  solaire: "SOLAIRE",
  import:  "IMPORT GRID",
  export:  "EXPORT GRID",
  cumulus: "CUMULUS",
  voiture: "VOITURE",
};

// =========================================================================
// SVG generator (pure function: state → string)
// =========================================================================
function generateSVG(state, colors = DEFAULT_COLORS, icons = ICONS, extra = null, fonts = DEFAULT_FONTS, labels = DEFAULT_LABELS, topLabel = null, flowStyle = DEFAULT_FLOW_STYLE, extra2 = null) {
  // Accept colors as either "#rrggbb" hex or legacy "r,g,b" string. Normalize to "r,g,b".
  const _toRgbStr = (c) => {
    if (!c) return "0,0,0";
    const s = String(c).trim();
    const hexMatch = s.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (hexMatch) return [hexMatch[1], hexMatch[2], hexMatch[3]].map(h => parseInt(h, 16)).join(",");
    return s;
  };
  colors = {
    solaire: _toRgbStr(colors.solaire || DEFAULT_COLORS.solaire),
    import:  _toRgbStr(colors.import  || DEFAULT_COLORS.import),
    export:  _toRgbStr(colors.export  || DEFAULT_COLORS.export),
    cumulus: _toRgbStr(colors.cumulus || DEFAULT_COLORS.cumulus),
    voiture: _toRgbStr(colors.voiture || DEFAULT_COLORS.voiture),
  };
  if (extra) {
    extra = {
      ...extra,
      color:           extra.color           ? _toRgbStr(extra.color)           : DEFAULT_EXTRA.color,
      charge_color:    extra.charge_color    ? _toRgbStr(extra.charge_color)    : DEFAULT_EXTRA.charge_color,
      discharge_color: extra.discharge_color ? _toRgbStr(extra.discharge_color) : DEFAULT_EXTRA.discharge_color,
    };
  }
  if (extra2) {
    extra2 = {
      ...extra2,
      color: extra2.color ? _toRgbStr(extra2.color) : DEFAULT_EXTRA.color,
    };
  }
  const F_W_LINE = fonts.w_label_line ?? DEFAULT_FONTS.w_label_line;
  const F_W_VAL  = fonts.w_value      ?? DEFAULT_FONTS.w_value;
  const F_KWH    = fonts.kwh_value    ?? DEFAULT_FONTS.kwh_value;
  const F_W_MAISON   = Math.round(F_W_VAL * 38 / 26);
  const F_KWH_MAISON = Math.round(F_KWH   * 18 / 15);
  const sW = state.pv_production;
  const hW = state.house_consumption;
  const iW = state.grid_import;
  const eW = state.grid_export;
  const cW = state.pvrouter_surplus;
  const vW = state.ev_charger_power;
  const sKwh = state.pv_daily_kwh.toFixed(1);
  const hKwh = state.house_daily_kwh.toFixed(1);
  const iKwh = state.grid_daily_import.toFixed(1);
  const eKwh = state.grid_daily_export.toFixed(1);
  const cKwh = state.pvrouter_daily.toFixed(1);
  const vKwh = state.ev_daily.toFixed(1);

  const lSolarMaison   = sW;
  const lMaisonExport  = eW;
  const lImportMaison  = iW;
  const lMaisonCumulus = cW;
  const lMaisonVoiture = vW;
  const isBattery = !!(extra && extra.type === "battery");

  // Battery direction is auto-detected from filled sensors. Two ways to feed it:
  //   1. signed extra_w (+ charge / − discharge)
  //   2. separate extra_charge_w / extra_discharge_w (split mode wins if any > 0)
  let xNetW = 0;          // signed
  let xDir = "charge";    // "charge" | "discharge"
  if (isBattery) {
    const cW = state.extra_charge_w || 0;
    const dW = state.extra_discharge_w || 0;
    xNetW = (cW > 0 || dW > 0) ? (cW - dW) : (state.extra_w || 0);
    xDir = xNetW >= 0 ? "charge" : "discharge";
  }
  const xActiveColor = isBattery
    ? (xDir === "charge" ? extra.charge_color : extra.discharge_color)
    : (extra ? extra.color : "0,0,0");

  const xW   = extra ? (isBattery ? Math.abs(xNetW) : state.extra_w)              : 0;
  const xKwh = extra ? (isBattery ? "0"             : state.extra_kwh.toFixed(1)) : "0";
  const lMaisonExtra = xW;
  // extra2 is always mono (no battery mode) — bottom-center optional 7th box.
  const x2W   = extra2 ? state.extra2_w : 0;
  const x2Kwh = extra2 ? state.extra2_kwh.toFixed(1) : "0";
  const lMaisonExtra2 = x2W;

  const isOn  = (w) => w > 0;
  const wDisp = (w) => w;

  // A spoke is disabled (and therefore not rendered) iff BOTH its W and kWh
  // entity IDs are unset. Maison stays mandatory.
  const E = state.entityIds;
  const enabled = {
    solaire: !!(E.pv_production    || E.pv_daily_kwh),
    import:  !!(E.grid_import      || E.grid_daily_import),
    export:  !!(E.grid_export      || E.grid_daily_export),
    cumulus: !!(E.pvrouter_surplus || E.pvrouter_daily),
    voiture: !!(E.ev_charger_power || E.ev_daily),
  };

  // Layout
  const xL = 110, xC = 440, xR = 770;
  const yTop = 130, yMid = 360, yBot = 590;
  const wStd = 168, hStd = 116;
  const wSolar = 178, hSolar = 116;
  const wExport = 188, hExport = 116;
  const wMaison = 220, hMaison = 170;
  const P_import  = { x: xL, y: yTop };
  const P_cumulus = { x: xL, y: yMid };
  const P_voiture = { x: xL, y: yBot };
  const P_solaire = { x: xR, y: yTop };
  const P_export  = { x: xR, y: yBot };
  const P_extra   = { x: xR, y: yMid };  // optional 6th box, mid-right — reserved for battery
  const P_extra2  = { x: xC, y: yBot };  // optional 7th box, bottom-center (between Voiture and Export)
  const importR  = xL + wStd/2;
  const importB  = yTop + hStd/2;
  const cumulusR = xL + wStd/2;
  const voitureT = yBot - hStd/2;
  const solaireB = yTop + hSolar/2;
  const exportT  = yBot - hExport/2;
  const extraL   = xR - wStd/2;
  const extra2T  = yBot - hStd/2;

  const animDur = (w) => {
    if (!isOn(w)) return 0;
    return Math.max(0.5, Math.min(2.4, 2.4 - Math.log2(Math.max(1, w)) * 0.18));
  };
  const flow = { ...DEFAULT_FLOW_STYLE, ...(flowStyle || {}) };
  const op = (active) => active ? flow.active_opacity : flow.inactive_opacity;
  const linkStroke = (active, color) => {
    if (active || flow.inactive_color_mix >= 100) return color;
    return `color-mix(in srgb, ${color} ${flow.inactive_color_mix}%, var(--ha-card-background))`;
  };

  const elbow = (x1, y1, x2, y2, hFirst=true, r=22) => {
    const dx = x2 - x1, dy = y2 - y1;
    if (Math.abs(dx) < 1 || Math.abs(dy) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const sx = Math.sign(dx), sy = Math.sign(dy);
    const rr = Math.min(r, Math.abs(dx) - 2, Math.abs(dy) - 2);
    if (hFirst) {
      const cornerX = x2 - sx * rr;
      const cornerY = y1 + sy * rr;
      const sweep = (sx === sy) ? 1 : 0;
      return `M ${x1} ${y1} H ${cornerX.toFixed(1)} A ${rr} ${rr} 0 0 ${sweep} ${x2} ${cornerY.toFixed(1)} V ${y2}`;
    } else {
      const cornerX = x1 + sx * rr;
      const cornerY = y2 - sy * rr;
      const sweep = (sx === sy) ? 0 : 1;
      return `M ${x1} ${y1} V ${cornerY.toFixed(1)} A ${rr} ${rr} 0 0 ${sweep} ${cornerX.toFixed(1)} ${y2} H ${x2}`;
    }
  };
  const straight = (x1, y1, x2, y2) => `M ${x1} ${y1} L ${x2} ${y2}`;

  // Autarky ring
  const autarky = state.house_daily_kwh > 0
    ? Math.max(0, Math.min(100, ((state.house_daily_kwh - state.grid_daily_import) / state.house_daily_kwh) * 100))
    : 0;
  const ringR = 110;
  const ringC = 2 * Math.PI * ringR;
  const ringOff = ringC * (1 - autarky / 100);
  const ringColor = autarky > 70 ? "#10B981" : autarky > 30 ? "#F59E0B" : "#F43F5E";

  // Circle intersection points
  const _off85 = Math.sqrt(ringR*ringR - 85*85);
  const maisonR_top = xC + _off85;
  const maisonL_top = xC - _off85;
  const maisonL_mid = xC - ringR;
  const maisonR_mid = xC + ringR;  // for optional extra box
  const maisonL_bot = xC - _off85;
  const maisonR_bot = xC + _off85;

  const GAP = 6;
  const ringExt = (px, py) => {
    const dx = px - xC, dy = py - yMid;
    const len = Math.hypot(dx, dy);
    const f = (len + GAP) / len;
    return { x: xC + dx * f, y: yMid + dy * f };
  };
  const m_top_R = ringExt(maisonR_top, yMid - 85);
  const m_top_L = ringExt(maisonL_top, yMid - 85);
  const m_mid_L = ringExt(maisonL_mid, yMid);
  const m_mid_R = ringExt(maisonR_mid, yMid);  // for optional extra box (battery slot)
  const m_bot_L = ringExt(maisonL_bot, yMid + 85);
  const m_bot_R = ringExt(maisonR_bot, yMid + 85);
  const m_bot_C = ringExt(xC, yMid + ringR);   // for optional extra2 box (bottom-center)

  const path_solaire_to_maison  = elbow(xR, solaireB + GAP, m_top_R.x, m_top_R.y, false);
  const path_import_to_maison   = elbow(xL, importB + GAP, m_top_L.x, m_top_L.y, false);
  const path_maison_to_cumulus  = straight(m_mid_L.x, m_mid_L.y, cumulusR + GAP, yMid);
  const path_maison_to_voiture  = elbow(m_bot_L.x, m_bot_L.y, xL, voitureT - GAP, true);
  const path_maison_to_export   = elbow(m_bot_R.x, m_bot_R.y, xR, exportT - GAP, true);
  // Charging: maison → battery (left → right). Discharging: battery → maison (right → left).
  const path_maison_to_extra    = extra
    ? (isBattery && xDir === "discharge"
        ? straight(extraL - GAP, yMid, m_mid_R.x, m_mid_R.y)
        : straight(m_mid_R.x, m_mid_R.y, extraL - GAP, yMid))
    : null;
  // Second optional box (bottom-center, between Voiture and Export). Always
  // a pure consumer (mono mode) — flow is always maison → extra2 downwards.
  const path_maison_to_extra2   = extra2
    ? straight(m_bot_C.x, m_bot_C.y, xC, extra2T - GAP)
    : null;

  const L_solaire       = { x: 614, y: 258 };
  const L_import        = { x: 266, y: 258 };
  const L_cumulus       = { x: 266, y: 342 };
  const L_voiture       = { x: 266, y: 428 };
  const L_maison_export = { x: 614, y: 428 };
  const L_maison_extra  = { x: 614, y: 342 };  // mirror of L_cumulus
  const L_maison_extra2 = { x: xC + 80, y: (m_bot_C.y + extra2T) / 2 };  // bottom-center, shifted right so the W label clears the vertical arrow even with 4-digit values

  const linkPath = (d, color, w, name) => {
    const active = isOn(w);
    const dur = animDur(w);
    const animStyle = active ? `animation: flow ${dur}s linear infinite;` : "";
    const lw = active ? flow.active_stroke_width : flow.inactive_stroke_width;
    const dash = active ? flow.active_dasharray : flow.inactive_dasharray;
    const markerId = active ? `arr-${name}` : `arr-${name}-dim`;
    return `<path d='${d}' stroke='${linkStroke(active, color)}' stroke-width='${lw}' fill='none' opacity='${op(active)}' stroke-dasharray='${dash}' style='${animStyle}' marker-end='url(#${markerId})'/>`;
  };

  const wLabel = (L, color, w) => {
    if (!isOn(w)) return "";
    // Single text element (no tspan dx) so digits and unit share the exact
    // same baseline — tspan was causing visual misalignment of the "W".
    return `<text x='${L.x}' y='${L.y}' text-anchor='middle' dominant-baseline='middle' fill='${color}' font-size='${F_W_LINE}' font-weight='800' font-family='ui-monospace,monospace' paint-order='stroke' stroke='var(--ha-card-background)' stroke-width='18' stroke-linejoin='round'>${w} W</text>`;
  };

  const node = (P, label, w, kwh, color, icon, wEntity, kwhEntity, nodeKey="", width=wStd, height=hStd) => `
<g transform='translate(${P.x}, ${P.y})' class='fec-node' data-node-key='${nodeKey}' data-w-entity='${wEntity}' data-kwh-entity='${kwhEntity}' style="cursor:pointer;">
  <rect x='${-width/2}' y='${-height/2}' width='${width}' height='${height}' rx='18' fill='rgba(${color},0.18)' stroke='rgba(${color},0.65)' stroke-width='2'/>
  <foreignObject x='-16' y='${-height/2 + 6}' width='32' height='32' style='overflow:visible;'>
    <div xmlns='http://www.w3.org/1999/xhtml' style='display:flex; justify-content:center; align-items:center; height:32px;'>
      <ha-icon icon='${icon}' style='--mdc-icon-size:28px; color:color-mix(in srgb, rgb(${color}) 70%, var(--primary-text-color)); display:block;'></ha-icon>
    </div>
  </foreignObject>
  <text x='0' y='3' text-anchor='middle' fill='var(--primary-text-color)' font-size='14' font-weight='800' letter-spacing='1.2'>${label}</text>
  <text x='0' y='30' text-anchor='middle' fill='var(--primary-text-color)' font-size='${F_W_VAL}' font-weight='900' font-family='ui-monospace,monospace' letter-spacing='-0.8'>${wDisp(w)} W</text>
  <text x='0' y='52' text-anchor='middle' fill='color-mix(in srgb, rgb(${color}) 70%, var(--primary-text-color))' font-size='${F_KWH}' font-weight='700' font-variant-numeric='tabular-nums'>${kwh} kWh</text>
</g>`;

  // Battery box: 4 lines (icon+label, SoC%, ±kW, daily ↑/↓ kWh).
  // activeColor flips between charge_color (charging) and discharge_color (discharging).
  const nodeBattery = (P, label, icon, soc, netW, chargedKwh, dischargedKwh, direction, activeColor, wEntity, kwhEntity, nodeKey="extra", width=wStd, height=hStd) => {
    const sign = direction === "charge" ? "+" : "−";
    const wAbs = Math.abs(netW);
    const kwTxt = wAbs >= 1000 ? (wAbs / 1000).toFixed(1) : (wAbs / 1000).toFixed(2);
    return `
<g transform='translate(${P.x}, ${P.y})' class='fec-node' data-node-key='${nodeKey}' data-w-entity='${wEntity}' data-kwh-entity='${kwhEntity}' style="cursor:pointer;">
  <rect x='${-width/2}' y='${-height/2}' width='${width}' height='${height}' rx='18' fill='rgba(${activeColor},0.18)' stroke='rgba(${activeColor},0.65)' stroke-width='2'/>
  <foreignObject x='${-width/2}' y='${-height/2 + 4}' width='${width}' height='24' style='overflow:visible;'>
    <div xmlns='http://www.w3.org/1999/xhtml' style='display:flex; align-items:center; justify-content:center; gap:6px; height:24px; font-family:ui-sans-serif,system-ui,sans-serif;'>
      <ha-icon icon='${icon}' style='--mdc-icon-size:20px; color:color-mix(in srgb, rgb(${activeColor}) 80%, var(--primary-text-color)); display:block;'></ha-icon>
      <span style='font-size:13px; font-weight:800; letter-spacing:1.2px; color:var(--primary-text-color); text-transform:uppercase;'>${label}</span>
    </div>
  </foreignObject>
  <text x='0' y='8' text-anchor='middle' fill='var(--primary-text-color)' font-size='30' font-weight='900' font-family='ui-monospace,monospace' letter-spacing='-1' font-variant-numeric='tabular-nums'>${Math.round(soc)}%</text>
  <text x='0' y='30' text-anchor='middle' fill='color-mix(in srgb, rgb(${activeColor}) 80%, var(--primary-text-color))' font-size='13' font-weight='700' font-variant-numeric='tabular-nums'>${sign} ${kwTxt} kW</text>
  <text x='0' y='50' text-anchor='middle' fill='var(--secondary-text-color)' font-size='11' font-weight='600' font-variant-numeric='tabular-nums'>↑ ${chargedKwh.toFixed(1)} · ↓ ${dischargedKwh.toFixed(1)} kWh</text>
</g>`;
  };

  return `
<style>@keyframes flow { to { stroke-dashoffset: -32; } }</style>
<svg viewBox='20 70 850 580' xmlns='http://www.w3.org/2000/svg' style='width:100%;height:auto;display:block;'>
  <defs>
    <marker id='arr-solaire' viewBox='0 0 10 10' refX='8' refY='5' markerWidth='7' markerHeight='7' orient='auto'><path d='M 0 0 L 10 5 L 0 10 z' fill='#${rgbToHex(colors.solaire)}'/></marker>
    <marker id='arr-import' viewBox='0 0 10 10' refX='8' refY='5' markerWidth='7' markerHeight='7' orient='auto'><path d='M 0 0 L 10 5 L 0 10 z' fill='#${rgbToHex(colors.import)}'/></marker>
    <marker id='arr-export' viewBox='0 0 10 10' refX='8' refY='5' markerWidth='7' markerHeight='7' orient='auto'><path d='M 0 0 L 10 5 L 0 10 z' fill='#${rgbToHex(colors.export)}'/></marker>
    <marker id='arr-cumulus' viewBox='0 0 10 10' refX='8' refY='5' markerWidth='7' markerHeight='7' orient='auto'><path d='M 0 0 L 10 5 L 0 10 z' fill='#${rgbToHex(colors.cumulus)}'/></marker>
    <marker id='arr-voiture' viewBox='0 0 10 10' refX='8' refY='5' markerWidth='7' markerHeight='7' orient='auto'><path d='M 0 0 L 10 5 L 0 10 z' fill='#${rgbToHex(colors.voiture)}'/></marker>
    <marker id='arr-solaire-dim' viewBox='0 0 10 10' refX='8' refY='5' markerWidth='6' markerHeight='6' orient='auto'><path d='M 0 0 L 10 5 L 0 10 z' fill='#${rgbToHex(colors.solaire)}'/></marker>
    <marker id='arr-import-dim' viewBox='0 0 10 10' refX='8' refY='5' markerWidth='6' markerHeight='6' orient='auto'><path d='M 0 0 L 10 5 L 0 10 z' fill='#${rgbToHex(colors.import)}'/></marker>
    <marker id='arr-export-dim' viewBox='0 0 10 10' refX='8' refY='5' markerWidth='6' markerHeight='6' orient='auto'><path d='M 0 0 L 10 5 L 0 10 z' fill='#${rgbToHex(colors.export)}'/></marker>
    <marker id='arr-cumulus-dim' viewBox='0 0 10 10' refX='8' refY='5' markerWidth='6' markerHeight='6' orient='auto'><path d='M 0 0 L 10 5 L 0 10 z' fill='#${rgbToHex(colors.cumulus)}'/></marker>
    <marker id='arr-voiture-dim' viewBox='0 0 10 10' refX='8' refY='5' markerWidth='6' markerHeight='6' orient='auto'><path d='M 0 0 L 10 5 L 0 10 z' fill='#${rgbToHex(colors.voiture)}'/></marker>
    ${extra ? `
    <marker id='arr-extra' viewBox='0 0 10 10' refX='8' refY='5' markerWidth='7' markerHeight='7' orient='auto'><path d='M 0 0 L 10 5 L 0 10 z' fill='#${rgbToHex(xActiveColor)}'/></marker>
    <marker id='arr-extra-dim' viewBox='0 0 10 10' refX='8' refY='5' markerWidth='6' markerHeight='6' orient='auto'><path d='M 0 0 L 10 5 L 0 10 z' fill='#${rgbToHex(xActiveColor)}'/></marker>
    ` : ""}
    ${extra2 ? `
    <marker id='arr-extra2' viewBox='0 0 10 10' refX='8' refY='5' markerWidth='7' markerHeight='7' orient='auto'><path d='M 0 0 L 10 5 L 0 10 z' fill='#${rgbToHex(extra2.color)}'/></marker>
    <marker id='arr-extra2-dim' viewBox='0 0 10 10' refX='8' refY='5' markerWidth='6' markerHeight='6' orient='auto'><path d='M 0 0 L 10 5 L 0 10 z' fill='#${rgbToHex(extra2.color)}'/></marker>
    ` : ""}
  </defs>

  ${enabled.solaire ? linkPath(path_solaire_to_maison, "#" + rgbToHex(colors.solaire), lSolarMaison,   "solaire") : ""}
  ${enabled.import  ? linkPath(path_import_to_maison,  "#" + rgbToHex(colors.import),  lImportMaison,  "import")  : ""}
  ${enabled.cumulus ? linkPath(path_maison_to_cumulus, "#" + rgbToHex(colors.cumulus), lMaisonCumulus, "cumulus") : ""}
  ${enabled.voiture ? linkPath(path_maison_to_voiture, "#" + rgbToHex(colors.voiture), lMaisonVoiture, "voiture") : ""}
  ${enabled.export  ? linkPath(path_maison_to_export,  "#" + rgbToHex(colors.export),  lMaisonExport,  "export")  : ""}
  ${extra ? linkPath(path_maison_to_extra, "#" + rgbToHex(xActiveColor), lMaisonExtra, "extra") : ""}
  ${extra2 ? linkPath(path_maison_to_extra2, "#" + rgbToHex(extra2.color), lMaisonExtra2, "extra2") : ""}

  ${enabled.solaire ? wLabel(L_solaire,       "#" + rgbToHex(colors.solaire), lSolarMaison)   : ""}
  ${enabled.import  ? wLabel(L_import,        "#" + rgbToHex(colors.import),  lImportMaison)  : ""}
  ${enabled.cumulus ? wLabel(L_cumulus,       "#" + rgbToHex(colors.cumulus), lMaisonCumulus) : ""}
  ${enabled.voiture ? wLabel(L_voiture,       "#" + rgbToHex(colors.voiture), lMaisonVoiture) : ""}
  ${enabled.export  ? wLabel(L_maison_export, "#" + rgbToHex(colors.export),  lMaisonExport)  : ""}
  ${extra ? wLabel(L_maison_extra, "#" + rgbToHex(xActiveColor), lMaisonExtra) : ""}
  ${extra2 ? wLabel(L_maison_extra2, "#" + rgbToHex(extra2.color), lMaisonExtra2) : ""}

  ${enabled.import  ? node(P_import,  labels.import  || DEFAULT_LABELS.import,  iW, iKwh, colors.import,  icons.import,  state.entityIds.grid_import,      state.entityIds.grid_daily_import,   "import")  : ""}
  ${enabled.cumulus ? node(P_cumulus, labels.cumulus || DEFAULT_LABELS.cumulus, cW, cKwh, colors.cumulus, icons.cumulus, state.entityIds.pvrouter_surplus, state.entityIds.pvrouter_daily,      "cumulus") : ""}
  ${enabled.voiture ? node(P_voiture, labels.voiture || DEFAULT_LABELS.voiture, vW, vKwh, colors.voiture, icons.voiture, state.entityIds.ev_charger_power, state.entityIds.ev_daily,            "voiture") : ""}
  ${enabled.solaire ? node(P_solaire, labels.solaire || DEFAULT_LABELS.solaire, sW, sKwh, colors.solaire, icons.solaire, state.entityIds.pv_production,    state.entityIds.pv_daily_kwh,        "solaire", wSolar,  hSolar)  : ""}
  ${enabled.export  ? node(P_export,  labels.export  || DEFAULT_LABELS.export,  eW, eKwh, colors.export,  icons.export,  state.entityIds.grid_export,      state.entityIds.grid_daily_export,   "export",  wExport, hExport) : ""}
  ${extra ? (isBattery
      ? nodeBattery(
          P_extra,
          extra.label || "BATTERIE",
          extra.icon || "mdi:battery",
          state.extra_soc || 0,
          xNetW,
          state.extra_charged_kwh || 0,
          state.extra_discharged_kwh || 0,
          xDir,
          xActiveColor,
          state.entityIds.extra_soc || state.entityIds.extra_w,
          state.entityIds.extra_charged_kwh || state.entityIds.extra_kwh,
          "extra"
        )
      : node(P_extra, extra.label || "EXTRA", xW, xKwh, extra.color, extra.icon || "mdi:battery", state.entityIds.extra_w, state.entityIds.extra_kwh, "extra")
    ) : ""}
  ${extra2 ? node(P_extra2, extra2.label || "BOX++", x2W, x2Kwh, extra2.color, extra2.icon || "mdi:lightning-bolt", state.entityIds.extra2_w, state.entityIds.extra2_kwh, "extra2") : ""}

  ${topLabel && topLabel.text ? `<text x='${xC}' y='${yTop}' text-anchor='middle' dominant-baseline='middle' fill='${normalizeColor(topLabel.color) || "var(--primary-text-color)"}' font-size='${topLabel.font_size || 24}' font-weight='800' letter-spacing='1.5'>${escapeXml(topLabel.text)}</text>` : ""}

  <g transform='translate(${xC}, ${yMid})' class='fec-maison' data-node-key='maison' data-w-entity='${state.entityIds.house_consumption}' data-kwh-entity='${state.entityIds.house_daily_kwh}' style="cursor:pointer;">
    <circle r='${ringR}' fill='none' stroke='var(--divider-color)' stroke-width='10'/>
    <circle r='${ringR}' fill='none' stroke='${ringColor}' stroke-width='10' stroke-linecap='round' stroke-dasharray='${ringC.toFixed(1)}' stroke-dashoffset='${ringOff.toFixed(1)}' transform='rotate(-90)' style='transition: stroke-dashoffset 800ms cubic-bezier(0.34,1.56,0.64,1), stroke 400ms;'/>
    <foreignObject x='-26' y='-86' width='52' height='52' style='overflow:visible;'>
      <div xmlns='http://www.w3.org/1999/xhtml' style='display:flex; justify-content:center; align-items:center; height:52px;'>
        <ha-icon icon='${icons.maison}' style='--mdc-icon-size:48px; color:var(--secondary-text-color); display:block;'></ha-icon>
      </div>
    </foreignObject>
    <text x='0' y='-12' text-anchor='middle' fill='${ringColor}' font-size='34' font-weight='900' font-variant-numeric='tabular-nums' letter-spacing='-2'>${Math.round(autarky)}%</text>
    <text x='0' y='30' text-anchor='middle' fill='var(--primary-text-color)' font-size='${F_W_MAISON}' font-weight='900' font-family='ui-monospace,monospace' letter-spacing='-1.5'>${wDisp(hW)} W</text>
    <text x='0' y='62' text-anchor='middle' fill='var(--secondary-text-color)' font-size='${F_KWH_MAISON}' font-weight='700' font-variant-numeric='tabular-nums'>${hKwh} kWh</text>
  </g>
</svg>`;
}

function rgbToHex(rgb) {
  // rgb is "r,g,b" string
  return rgb.split(',').map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;","'":"&apos;"}[c]));
}

function normalizeColor(c) {
  if (!c) return null;
  const s = String(c).trim();
  // r,g,b → rgb(r,g,b)
  if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(s)) return `rgb(${s})`;
  return s;  // already a color (hex, var(...), name, rgb(...), etc.)
}

// Auto-derive text color from background luminance. Returns null if the bg is a
// gradient or any non-solid value (caller falls back to theme variables).
// Uses sRGB relative luminance per WCAG; threshold 0.5.
function _autoTextFromBg(bg) {
  if (!bg) return null;
  const s = String(bg).trim();
  if (/gradient|var\(|url\(/i.test(s)) return null; // bail on non-solid backgrounds
  let r, g, b;
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3
      ? hex[1].split("").map(c => c + c).join("")
      : hex[1];
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    const rgb = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!rgb) return null;
    [, r, g, b] = rgb.map(Number);
  }
  // Relative luminance (rec. 709 weights, simplified — good enough for threshold)
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.5 ? "#f1f5f9" : "#0f172a";
}

// Dim variant of the main text color for secondary labels (70% mixed toward bg).
function _dimText(textColor) {
  if (!textColor) return null;
  return `color-mix(in srgb, ${textColor} 70%, transparent)`;
}

// =========================================================================
// Card element
// =========================================================================
class FluxEnergieCard extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: { state: true },
    };
  }

  setConfig(config) {
    if (!config.entities) {
      throw new Error("Config requires 'entities' section");
    }
    // triggers_update was a button-card v6 directive; v7+ and LitElement cards
    // (like this one) re-render automatically from hass changes. We silently
    // accept the key so old YAML imported from the forum doesn't break.
    if (config.triggers_update !== undefined) {
      console.debug("flux-energie-card: 'triggers_update' is a no-op here (auto-handled).");
    }
    this._config = config;
  }

  static getConfigElement() {
    return document.createElement("flux-energie-card-editor");
  }

  static getStubConfig() {
    return {
      entities: {
        pv_production:     "sensor.your_pv_production_w",
        house_consumption: "sensor.your_house_consumption_w",
        grid_import:       "sensor.your_grid_import_w",
        grid_export:       "sensor.your_grid_export_w",
        pvrouter_surplus:  "sensor.your_pvrouter_surplus_w",
        ev_charger_power:  "sensor.your_ev_charger_power_w",
        pv_daily_kwh:      "sensor.your_pv_daily_kwh",
        house_daily_kwh:   "sensor.your_house_daily_kwh",
        grid_daily_export: "sensor.your_grid_daily_export_kwh",
        grid_daily_import: "sensor.your_grid_daily_import_kwh",
        pvrouter_daily:    "sensor.your_pvrouter_daily_kwh",
        ev_daily:          "sensor.your_ev_daily_kwh",
      },
    };
  }

  getCardSize() { return 6; }

  _num(eid, def = 0) {
    const s = this.hass?.states?.[eid]?.state;
    const v = parseFloat(s);
    return isNaN(v) ? def : Math.round(v);
  }
  _numF(eid, def = 0) {
    const s = this.hass?.states?.[eid]?.state;
    const v = parseFloat(s);
    return isNaN(v) ? def : v;
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    const evt = new Event("hass-more-info", { bubbles: true, composed: true });
    evt.detail = { entityId };
    this.dispatchEvent(evt);
  }

  // Resolve the action config for a given node + interaction kind ("tap" | "hold").
  //   priority: per-node override (config.nodes[key].{tap_action|hold_action})
  //          → card-level (config.{tap_action|hold_action})
  //          → built-in default ({ action: "more-info" })
  // entityFallback is the entity passed to more-info when no `entity` is set
  // in the action config (W entity for tap, kWh entity for hold).
  _resolveAction(nodeKey, kind) {
    const perNode = nodeKey && this._config?.nodes?.[nodeKey];
    const key = kind === "hold" ? "hold_action" : "tap_action";
    return perNode?.[key]
        ?? this._config?.[key]
        ?? { action: "more-info" };
  }

  _handleAction(actionCfg, entityFallback) {
    if (!actionCfg || actionCfg.action === "none") return;
    const a = actionCfg.action || "more-info";
    switch (a) {
      case "more-info": {
        const eid = actionCfg.entity || entityFallback;
        if (!eid) return;
        const evt = new Event("hass-more-info", { bubbles: true, composed: true });
        evt.detail = { entityId: eid };
        this.dispatchEvent(evt);
        return;
      }
      case "toggle": {
        const eid = actionCfg.entity || entityFallback;
        if (!eid || !this.hass) return;
        const domain = eid.split(".")[0];
        // Domains that support a plain "toggle" service; otherwise fall back to homeassistant.toggle.
        const TOGGLE_DOMAINS = new Set(["switch","light","fan","input_boolean","automation","script","cover","media_player","humidifier","siren","valve"]);
        const svcDomain = TOGGLE_DOMAINS.has(domain) ? domain : "homeassistant";
        this.hass.callService(svcDomain, "toggle", { entity_id: eid });
        return;
      }
      case "navigate": {
        const p = actionCfg.navigation_path;
        if (!p) return;
        window.history.pushState(null, "", p);
        window.dispatchEvent(new Event("location-changed"));
        return;
      }
      case "url": {
        const u = actionCfg.url_path;
        if (!u) return;
        window.open(u, "_blank", "noopener,noreferrer");
        return;
      }
      case "call-service": {
        const svc = actionCfg.service;
        if (!svc || !this.hass) return;
        const [d, s] = svc.split(".");
        if (!d || !s) return;
        this.hass.callService(d, s, actionCfg.service_data || actionCfg.data || {}, actionCfg.target);
        return;
      }
      default:
        console.warn("flux-energie-card: unknown action type", a);
    }
  }

  render() {
    if (!this._config || !this.hass) return html``;
    const E = this._config.entities;
    const state = {
      entityIds: E,
      pv_production:     this._num(E.pv_production),
      house_consumption: this._num(E.house_consumption),
      grid_import:       this._num(E.grid_import),
      grid_export:       this._num(E.grid_export),
      pvrouter_surplus:  this._num(E.pvrouter_surplus),
      ev_charger_power:  this._num(E.ev_charger_power),
      pv_daily_kwh:      this._numF(E.pv_daily_kwh),
      house_daily_kwh:   this._numF(E.house_daily_kwh),
      grid_daily_export: this._numF(E.grid_daily_export),
      grid_daily_import: this._numF(E.grid_daily_import),
      pvrouter_daily:    this._numF(E.pvrouter_daily),
      ev_daily:          this._numF(E.ev_daily),
      extra_w:               this._num(E.extra_w),       // signed in battery mode (+ charge / − discharge)
      extra_kwh:             this._numF(E.extra_kwh),
      extra_charge_w:        this._num(E.extra_charge_w),
      extra_discharge_w:     this._num(E.extra_discharge_w),
      extra_soc:             this._numF(E.extra_soc),
      extra_charged_kwh:     this._numF(E.extra_charged_kwh),
      extra_discharged_kwh:  this._numF(E.extra_discharged_kwh),
      extra2_w:              this._num(E.extra2_w),
      extra2_kwh:            this._numF(E.extra2_kwh),
    };
    const colors = { ...DEFAULT_COLORS, ...(this._config.colors || {}) };
    const icons = { ...ICONS, ...(this._config.icons || {}) };
    const fonts = { ...DEFAULT_FONTS, ...(this._config.fonts || {}) };
    const labels = { ...DEFAULT_LABELS, ...(this._config.labels || {}) };
    const flowStyle = { ...DEFAULT_FLOW_STYLE, ...(this._config.flow_style || {}) };
    const topLabel = this._config.top_label || null;
    // Optional 6th box (battery slot, mid-right): enabled iff any extra_* W sensor
    // is configured. Optional 7th box (extra2, bottom-center): pure mono mode,
    // enabled iff extra2_w is configured.
    const extraEnabled = !!(E.extra_w || E.extra_charge_w || E.extra_discharge_w);
    const extra = extraEnabled
      ? { ...DEFAULT_EXTRA, ...(this._config.extra || {}) }
      : null;
    const extra2Enabled = !!E.extra2_w;
    const extra2 = extra2Enabled
      ? {
          label: "BOX++",
          icon:  "mdi:lightning-bolt",
          color: "59,130,246",
          ...(this._config.extra2 || {}),
        }
      : null;
    const svg = generateSVG(state, colors, icons, extra, fonts, labels, topLabel, flowStyle, extra2);
    // Background customization (config.background = any CSS color or full background
    // shorthand). If set: border auto-tints via CSS color-mix(); text colors
    // auto-flip via JS luminance probe (only when bg is a simple solid color).
    // Explicit border_color / text_color overrides win.
    const bg = this._config.background;
    const borderOverride = this._config.border_color;
    const textOverride = this._config.text_color || _autoTextFromBg(bg);
    // Border auto-derive: tonal lift from bg by mixing 20% of the (already
    // contrast-correct) text color into the bg. Explicit border_color wins.
    const borderAuto = (bg && textOverride) ? `color-mix(in srgb, ${bg} 80%, ${textOverride} 20%)` : null;
    const borderFinal = borderOverride || borderAuto;
    const cardStyle = [
      bg ? `--fec-bg: ${bg}` : "",
      borderFinal ? `--fec-border: ${borderFinal}` : "",
      textOverride ? `--primary-text-color: ${textOverride}` : "",
      textOverride ? `--secondary-text-color: ${_dimText(textOverride)}` : "",
    ].filter(Boolean).join("; ");
    return html`<ha-card style=${cardStyle}>${_unsafeHTML(svg)}</ha-card>`;
  }

  // Attach click handlers to nodes after render.
  // Behavior:
  //   • short press   → tap_action  (default: more-info on the W entity)
  //   • long press 500ms → hold_action (default: more-info on the kWh entity)
  //   • touchmove > 10px aborts the press so a vertical mobile scroll doesn't
  //     trigger a popup (forum request — post 79568, pascal_ha).
  updated() {
    const root = this.shadowRoot;
    if (!root) return;
    const MOVE_THRESHOLD = 10; // px — beyond this the press is considered a scroll
    root.querySelectorAll(".fec-node, .fec-maison").forEach((g) => {
      if (g._fecBound) return;
      g._fecBound = true;
      const nodeKey = g.getAttribute("data-node-key");
      const wEntity = g.getAttribute("data-w-entity");
      const kEntity = g.getAttribute("data-kwh-entity");
      let pressTimer = null;
      let longPressed = false;
      let aborted = false;
      let startX = 0, startY = 0;

      const start = (clientX, clientY) => {
        longPressed = false;
        aborted = false;
        startX = clientX;
        startY = clientY;
        pressTimer = setTimeout(() => {
          longPressed = true;
          if (!aborted) this._handleAction(this._resolveAction(nodeKey, "hold"), kEntity);
        }, 500);
      };
      const move = (clientX, clientY) => {
        if (Math.abs(clientX - startX) > MOVE_THRESHOLD || Math.abs(clientY - startY) > MOVE_THRESHOLD) {
          aborted = true;
          clearTimeout(pressTimer);
        }
      };
      const end = () => {
        clearTimeout(pressTimer);
        if (!aborted && !longPressed) {
          this._handleAction(this._resolveAction(nodeKey, "tap"), wEntity);
        }
        longPressed = false;
        aborted = false;
      };
      const cancel = () => { clearTimeout(pressTimer); longPressed = false; aborted = true; };

      g.addEventListener("mousedown", (e) => start(e.clientX, e.clientY));
      g.addEventListener("mousemove", (e) => move(e.clientX, e.clientY));
      g.addEventListener("mouseup", end);
      g.addEventListener("mouseleave", cancel);
      g.addEventListener("touchstart", (e) => {
        const t = e.touches[0];
        if (t) start(t.clientX, t.clientY);
      }, { passive: true });
      g.addEventListener("touchmove", (e) => {
        const t = e.touches[0];
        if (t) move(t.clientX, t.clientY);
      }, { passive: true });
      g.addEventListener("touchend", end);
      g.addEventListener("touchcancel", cancel);
    });
  }

  static get styles() {
    return css`
      ha-card {
        /* --fec-bg and --fec-border can be overridden from setConfig
           (config.background, config.border_color). --fec-border is also
           auto-derived from --fec-bg via color-mix() when the bg is a single
           color and no explicit override is provided. */
        background: var(--fec-bg,
                    radial-gradient(ellipse at 0% 0%, rgba(148,108,255,0.10), transparent 55%) ,
                    radial-gradient(ellipse at 100% 100%, rgba(255,209,102,0.07), transparent 55%) ,
                    var(--ha-card-background));
        border: 1px solid var(--fec-border, rgba(148,108,255,0.25));
        border-radius: 22px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.5);
        padding: 6px 8px 8px;
        pointer-events: auto !important;
      }
    `;
  }
}

customElements.define("flux-energie-card", FluxEnergieCard);

// =========================================================================
// Editor element
// =========================================================================
class FluxEnergieCardEditor extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: { state: true },
    };
  }

  setConfig(config) {
    this._config = config;
  }

  _entityChanged(key, ev) {
    if (!this._config) return;
    const newValue = ev.detail.value;
    const newEntities = { ...(this._config.entities || {}), [key]: newValue };
    const newConfig = { ...this._config, entities: newEntities };
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    }));
  }

  _extraChanged(key, ev) {
    if (!this._config) return;
    const newValue = ev.target?.value !== undefined ? ev.target.value : ev.detail?.value;
    const newExtra = { ...(this._config.extra || {}), [key]: newValue };
    const newConfig = { ...this._config, extra: newExtra };
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    }));
  }

  _extra2Changed(key, ev) {
    if (!this._config) return;
    const raw = ev.target?.value !== undefined ? ev.target.value : ev.detail?.value;
    const next = { ...(this._config.extra2 || {}) };
    if (raw == null || String(raw).trim() === "") {
      delete next[key];
    } else {
      next[key] = String(raw).trim();
    }
    const newConfig = { ...this._config };
    if (Object.keys(next).length === 0) delete newConfig.extra2;
    else newConfig.extra2 = next;
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    }));
  }

  _fontsChanged(key, ev) {
    if (!this._config) return;
    const raw = ev.target?.value !== undefined ? ev.target.value : ev.detail?.value;
    const num = parseInt(raw, 10);
    const newFonts = { ...(this._config.fonts || {}) };
    if (isNaN(num) || num <= 0) {
      delete newFonts[key];
    } else {
      newFonts[key] = num;
    }
    const newConfig = { ...this._config, fonts: newFonts };
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    }));
  }

  _colorChanged(node, ev) {
    if (!this._config) return;
    const raw = ev.target?.value !== undefined ? ev.target.value : ev.detail?.value;
    const newColors = { ...(this._config.colors || {}) };
    if (!raw || raw.trim() === "") {
      delete newColors[node];
    } else {
      newColors[node] = raw.trim();
    }
    const newConfig = { ...this._config, colors: newColors };
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    }));
  }

  _iconChanged(node, ev) {
    if (!this._config) return;
    const raw = ev.target?.value !== undefined ? ev.target.value : ev.detail?.value;
    const newIcons = { ...(this._config.icons || {}) };
    if (!raw || raw.trim() === "") {
      delete newIcons[node];
    } else {
      newIcons[node] = raw.trim();
    }
    const newConfig = { ...this._config, icons: newIcons };
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    }));
  }

  _labelChanged(node, ev) {
    if (!this._config) return;
    const raw = ev.target?.value !== undefined ? ev.target.value : ev.detail?.value;
    const newLabels = { ...(this._config.labels || {}) };
    if (!raw || raw.trim() === "") {
      delete newLabels[node];
    } else {
      newLabels[node] = raw;
    }
    const newConfig = { ...this._config, labels: newLabels };
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    }));
  }

  // Background customization (forum post 79568 / pascal_ha — adds card-level
  // background color override + auto-tinted border + auto-flipped text colors).
  _bgChanged(key, ev) {
    if (!this._config) return;
    const raw = ev.target?.value !== undefined ? ev.target.value : ev.detail?.value;
    const newConfig = { ...this._config };
    if (!raw || raw.trim() === "") delete newConfig[key];
    else newConfig[key] = raw.trim();
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: newConfig }, bubbles: true, composed: true,
    }));
  }

  // Per-node tap_action / hold_action — stored under config.nodes[key][kind].
  // kind is "tap" or "hold"; field is "action" | "entity" | "navigation_path" |
  // "url_path" | "service" so the editor can drive a typed second input.
  _actionChanged(nodeKey, kind, field, ev) {
    if (!this._config) return;
    const raw = ev.target?.value !== undefined ? ev.target.value : ev.detail?.value;
    const cleaned = raw == null ? "" : String(raw).trim();
    const k = kind === "hold" ? "hold_action" : "tap_action";
    const allNodes = { ...(this._config.nodes || {}) };
    const nodeCfg  = { ...(allNodes[nodeKey] || {}) };
    const actCfg   = { ...(nodeCfg[k] || {}) };

    if (field === "action") {
      if (!cleaned) {
        delete nodeCfg[k]; // reset to default
      } else {
        actCfg.action = cleaned;
        nodeCfg[k] = actCfg;
      }
    } else {
      if (cleaned === "") delete actCfg[field];
      else actCfg[field] = cleaned;
      // If no action set yet, default to more-info so the param has meaning.
      if (!actCfg.action) actCfg.action = "more-info";
      nodeCfg[k] = actCfg;
    }
    // Clean up: drop empty node entry
    if (Object.keys(nodeCfg).length === 0) {
      delete allNodes[nodeKey];
    } else {
      allNodes[nodeKey] = nodeCfg;
    }
    const newConfig = { ...this._config };
    if (Object.keys(allNodes).length === 0) delete newConfig.nodes;
    else newConfig.nodes = allNodes;

    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: newConfig }, bubbles: true, composed: true,
    }));
  }

  // Per-node Interactions block — renders inside each node's expanded body.
  // Two rows (tap / hold) with an action-type <select> and one context-sensitive
  // text input whose label changes based on the chosen action.
  _renderInteractions(nodeKey) {
    const ACTION_OPTS = [
      { value: "",             label: "⚙ Défaut (more-info)" },
      { value: "more-info",    label: "Plus d'infos" },
      { value: "toggle",       label: "Toggle" },
      { value: "navigate",     label: "Naviguer" },
      { value: "url",          label: "Ouvrir URL" },
      { value: "call-service", label: "Service" },
      { value: "none",         label: "Aucune" },
    ];
    const paramFor = (act) => {
      switch (act) {
        case "more-info":
        case "toggle":       return { label: "Entité (override)", field: "entity",          placeholder: "sensor.xxx" };
        case "navigate":     return { label: "Chemin de navigation", field: "navigation_path", placeholder: "/lovelace/energy" };
        case "url":          return { label: "URL", field: "url_path", placeholder: "https://..." };
        case "call-service": return { label: "Service", field: "service", placeholder: "switch.toggle" };
        default:             return null;
      }
    };
    const tap  = (this._config?.nodes?.[nodeKey]?.tap_action)  || {};
    const hold = (this._config?.nodes?.[nodeKey]?.hold_action) || {};
    const row = (kind, act) => {
      const param = paramFor(act.action);
      return html`
        <label class="field">
          <span class="field-label">${kind === "tap" ? "Tap (court appui)" : "Hold (long appui 500ms)"}</span>
          <select
            class="field-input"
            .value=${act.action || ""}
            @change=${(ev) => this._actionChanged(nodeKey, kind, "action", ev)}
          >
            ${ACTION_OPTS.map(o => html`<option value=${o.value} ?selected=${(act.action || "") === o.value}>${o.label}</option>`)}
          </select>
        </label>
        ${param ? html`
          <label class="field">
            <span class="field-label">${param.label}</span>
            <input
              class="field-input"
              type="text"
              .value=${act[param.field] || ""}
              placeholder=${param.placeholder}
              @input=${(ev) => this._actionChanged(nodeKey, kind, param.field, ev)}
            />
          </label>
        ` : ""}
      `;
    };
    return html`
      <details class="interactions-row">
        <summary class="interactions-summary">
          <ha-icon icon="mdi:gesture-tap"></ha-icon>
          <span>Interactions</span>
          ${(tap.action || hold.action) ? html`<span class="optional-tag">override</span>` : ""}
          <ha-icon class="node-chevron" icon="mdi:chevron-down"></ha-icon>
        </summary>
        <div class="interactions-body">
          <div class="hint">Comportement au tap (court) et au hold (long appui). Laisse "Défaut" pour garder le comportement standard (more-info sur W au tap, sur kWh au hold).</div>
          ${row("tap", tap)}
          ${row("hold", hold)}
        </div>
      </details>
    `;
  }

  _topLabelChanged(key, ev) {
    if (!this._config) return;
    const raw = ev.target?.value !== undefined ? ev.target.value : ev.detail?.value;
    const newTopLabel = { ...(this._config.top_label || {}) };
    if (key === "font_size") {
      const num = parseInt(raw, 10);
      if (isNaN(num) || num <= 0) delete newTopLabel.font_size;
      else newTopLabel.font_size = num;
    } else {
      if (!raw || raw.trim() === "") delete newTopLabel[key];
      else newTopLabel[key] = raw;
    }
    const newConfig = { ...this._config, top_label: newTopLabel };
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    if (!this._config) return html``;
    const E = this._config.entities || {};
    const X = this._config.extra || {};
    const X2 = this._config.extra2 || {};
    const F = this._config.fonts || {};
    const C = this._config.colors || {};
    const I = this._config.icons || {};
    const L = this._config.labels || {};
    const T = this._config.top_label || {};

    // Group sensors by unit_of_measurement so we can offer filtered datalists
    // per slot (W vs kWh) instead of one massive list with everything.
    // Strict filter: exclude forecast/prediction sensors (Solcast etc.) and
    // require device_class to match if it's set.
    const POWER_UNITS  = new Set(["W", "kW", "mW", "MW"]);
    const ENERGY_UNITS = new Set(["Wh", "kWh", "MWh"]);
    const FORECAST_RE  = /forecast|predict|estimate|prevision|prediction/i;
    const sensorsByGroup = { power: [], energy: [], all: [] };
    if (this.hass && this.hass.states) {
      const ids = Object.keys(this.hass.states).filter(id => id.startsWith("sensor.")).sort();
      for (const id of ids) {
        const attrs = this.hass.states[id].attributes || {};
        const unit = attrs.unit_of_measurement;
        const dc   = attrs.device_class;
        sensorsByGroup.all.push(id);
        if (FORECAST_RE.test(id)) continue;
        if (POWER_UNITS.has(unit) && (!dc || dc === "power")) {
          sensorsByGroup.power.push(id);
        } else if (ENERGY_UNITS.has(unit) && (!dc || dc === "energy")) {
          sensorsByGroup.energy.push(id);
        }
      }
    }
    const DATALIST = { power: "flux-sensors-power", energy: "flux-sensors-energy", all: "flux-sensors-all" };

    const txt = (label, value, placeholder, handler, type) => html`
      <label class="field">
        <span class="field-label">${label}</span>
        <input
          class="field-input"
          type=${type || "text"}
          .value=${value == null ? "" : String(value)}
          placeholder=${placeholder == null ? "" : String(placeholder)}
          @input=${handler}
        />
      </label>
    `;

    const ent = (label, value, handler, listId) => html`
      <label class="field">
        <span class="field-label">${label}</span>
        <input
          class="field-input"
          type="text"
          list=${listId || DATALIST.all}
          .value=${value || ""}
          placeholder="sensor.xxx"
          @input=${(ev) => handler({ detail: { value: ev.target.value } })}
        />
      </label>
    `;

    // Color picker — stores hex (#rrggbb). Falls back to default RGB on display.
    const _toHex = (v) => {
      if (!v) return null;
      const s = String(v).trim();
      const hexM = s.match(/^#?([0-9a-f]{6})$/i);
      if (hexM) return "#" + hexM[1].toLowerCase();
      const rgbM = s.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (rgbM) return "#" + [rgbM[1], rgbM[2], rgbM[3]].map(n => Math.max(0, Math.min(255, parseInt(n))).toString(16).padStart(2, '0')).join('');
      return null;
    };
    const colorField = (label, value, defaultValue, handler) => {
      const displayHex = _toHex(value) || _toHex(defaultValue) || "#000000";
      const isCustom = !!value;
      return html`
        <label class="field">
          <span class="field-label">${label}${isCustom ? "" : html` <span class="field-default">(défaut)</span>`}</span>
          <div class="color-row">
            <input
              class="color-swatch"
              type="color"
              .value=${displayHex}
              @input=${(ev) => handler({ target: { value: ev.target.value } })}
            />
            <code class="color-hex">${displayHex.toUpperCase()}</code>
            <button
              type="button"
              class="color-reset"
              ?disabled=${!isCustom}
              @click=${() => handler({ target: { value: "" } })}
              title="Réinitialiser au défaut"
            >↺</button>
          </div>
        </label>
      `;
    };

    // Node config: drives the collapsible list. Each node groups its sensors
    // and (optionally) its appearance overrides (label/color/icon).
    const NODES = [
      {
        key: "maison", title: "Maison", appearance: "icon-only",
        sensors: [
          { key: "house_consumption", label: "Consommation maison (W)", group: "power" },
          { key: "house_daily_kwh",   label: "Énergie maison (kWh)",     group: "energy" },
        ],
      },
      {
        key: "solaire", title: "Solaire", appearance: "full",
        sensors: [
          { key: "pv_production",     label: "Production PV (W)",       group: "power" },
          { key: "pv_daily_kwh",      label: "PV journalier (kWh)",     group: "energy" },
        ],
      },
      {
        key: "import", title: "Import grid", appearance: "full",
        sensors: [
          { key: "grid_import",       label: "Import réseau (W)",       group: "power" },
          { key: "grid_daily_import", label: "Import journalier (kWh)", group: "energy" },
        ],
      },
      {
        key: "export", title: "Export grid", appearance: "full",
        sensors: [
          { key: "grid_export",       label: "Export réseau (W)",       group: "power" },
          { key: "grid_daily_export", label: "Export journalier (kWh)", group: "energy" },
        ],
      },
      {
        key: "cumulus", title: "Cumulus", appearance: "full",
        sensors: [
          { key: "pvrouter_surplus",  label: "Surplus PV-router (W)",       group: "power" },
          { key: "pvrouter_daily",    label: "PV-router journalier (kWh)",  group: "energy" },
        ],
      },
      {
        key: "voiture", title: "Voiture", appearance: "full",
        sensors: [
          { key: "ev_charger_power",  label: "Wallbox puissance (W)",   group: "power" },
          { key: "ev_daily",          label: "EV journalier (kWh)",     group: "energy" },
        ],
      },
      {
        key: "extra", title: "Box additionnelle (Box+) — mi-droite, compatible batterie", appearance: "full", isExtra: true,
        sensors: [
          { key: "extra_w",   label: "Box+ — puissance (W)",    group: "power" },
          { key: "extra_kwh", label: "Box+ — énergie (kWh)",    group: "energy" },
        ],
        batterySensors: [
          { key: "extra_w",              label: "Puissance signée (W) — + charge / − décharge", group: "power"  },
          { key: "extra_charge_w",       label: "Charge (W) — alternative à la puissance signée", group: "power"  },
          { key: "extra_discharge_w",    label: "Décharge (W) — alternative à la puissance signée", group: "power"  },
          { key: "extra_soc",            label: "État de charge SoC (%)",                       group: "all"    },
          { key: "extra_charged_kwh",    label: "Chargé journalier (kWh)",                      group: "energy" },
          { key: "extra_discharged_kwh", label: "Déchargé journalier (kWh)",                    group: "energy" },
        ],
      },
      {
        key: "extra2", title: "Box additionnelle (Box++) — bas-centre", appearance: "full", isExtra2: true,
        sensors: [
          { key: "extra2_w",   label: "Box++ — puissance (W)",    group: "power" },
          { key: "extra2_kwh", label: "Box++ — énergie (kWh)",    group: "energy" },
        ],
      },
    ];

    const renderNode = (node) => {
      const isExtra = !!node.isExtra;
      const isExtra2 = !!node.isExtra2;
      const extraType = isExtra ? (X.type || "mono") : null;
      const isBatteryNode = extraType === "battery";
      const labelVal = isExtra ? (X.label || "") : isExtra2 ? (X2.label || "") : (L[node.key] || "");
      const colorVal = isExtra ? (X.color || "") : isExtra2 ? (X2.color || "") : (C[node.key] || "");
      const iconVal  = isExtra ? (X.icon  || "") : isExtra2 ? (X2.icon  || "") : (I[node.key] || "");
      const labelDefault = isExtra ? (isBatteryNode ? "BATTERIE" : "ex. CUMULUS") : isExtra2 ? "ex. FRIGO" : (DEFAULT_LABELS[node.key] || "");
      const colorDefault = isExtra ? "100,116,139"  : isExtra2 ? "59,130,246"   : (DEFAULT_COLORS[node.key] || "");
      const iconDefault  = isExtra ? "mdi:battery" : isExtra2 ? "mdi:lightning-bolt" : (ICONS[node.key] || "mdi:circle");
      const labelHandler = isExtra  ? (ev) => this._extraChanged("label", ev)
                         : isExtra2 ? (ev) => this._extra2Changed("label", ev)
                         :            (ev) => this._labelChanged(node.key, ev);
      const colorHandler = isExtra  ? (ev) => this._extraChanged("color", ev)
                         : isExtra2 ? (ev) => this._extra2Changed("color", ev)
                         :            (ev) => this._colorChanged(node.key, ev);
      const iconHandler  = isExtra  ? (ev) => this._extraChanged("icon", ev)
                         : isExtra2 ? (ev) => this._extra2Changed("icon", ev)
                         :            (ev) => this._iconChanged(node.key, ev);

      const summaryIcon = iconVal || iconDefault;
      const sensorsToShow = (isExtra && isBatteryNode) ? node.batterySensors : node.sensors;
      const summaryParts = sensorsToShow.map(s => E[s.key]).filter(Boolean);
      const summaryText = summaryParts.length === sensorsToShow.length
        ? summaryParts.join(" · ")
        : (summaryParts.length === 0
            ? html`<span class="missing">non configuré</span>`
            : html`<span class="missing">${summaryParts.length}/${sensorsToShow.length} configuré${summaryParts.length>1?"s":""}</span>`);

      return html`
        <details class="node-row">
          <summary class="node-summary">
            <ha-icon class="node-summary-icon" icon=${summaryIcon}></ha-icon>
            <div class="node-summary-text">
              <div class="node-summary-title">
                ${node.title}
                ${isExtra ? html`<span class="optional-tag">${isBatteryNode ? "batterie" : "mono"}</span>` : ""}
                ${isExtra2 ? html`<span class="optional-tag">mono</span>` : ""}
              </div>
              <div class="node-summary-info">${summaryText}</div>
            </div>
            <ha-icon class="node-chevron" icon="mdi:chevron-down"></ha-icon>
          </summary>
          <div class="node-body">
            ${isExtra ? html`
              <label class="field">
                <span class="field-label">Type de box</span>
                <select
                  class="field-input"
                  .value=${extraType}
                  @change=${(ev) => this._extraChanged("type", ev)}
                >
                  <option value="mono">Mono (puissance + énergie totale)</option>
                  <option value="battery">Batterie (charge/décharge + SoC + ↑/↓ kWh)</option>
                </select>
              </label>
              ${isBatteryNode ? html`<div class="hint">Remplis <strong>soit</strong> la puissance signée (+ charge / − décharge) <strong>soit</strong> les deux capteurs charge/décharge séparés. Le SoC et les kWh journaliers sont toujours nécessaires.</div>` : ""}
            ` : ""}
            ${sensorsToShow.map(s => ent(s.label, E[s.key], (ev) => this._entityChanged(s.key, ev), DATALIST[s.group] || DATALIST.all))}
            ${node.appearance === "full" ? html`
              ${txt("Label", labelVal, labelDefault, labelHandler)}
              ${isExtra && isBatteryNode ? html`
                ${colorField("Couleur charge",   X.charge_color    || "", "16,185,129",  (ev) => this._extraChanged("charge_color",    ev))}
                ${colorField("Couleur décharge", X.discharge_color || "", "168,85,247",  (ev) => this._extraChanged("discharge_color", ev))}
              ` : html`
                ${colorField("Couleur", colorVal, colorDefault, colorHandler)}
              `}
            ` : ""}
            ${node.appearance !== "none" ? html`
              <label class="field">
                <span class="field-label">Icône</span>
                <ha-icon-picker
                  .hass=${this.hass}
                  .value=${iconVal}
                  .placeholder=${iconDefault}
                  @value-changed=${iconHandler}
                ></ha-icon-picker>
              </label>
            ` : ""}

            ${this._renderInteractions(node.key)}
          </div>
        </details>
      `;
    };

    return html`
      <datalist id=${DATALIST.power}>
        ${sensorsByGroup.power.map(id => html`<option value=${id}></option>`)}
      </datalist>
      <datalist id=${DATALIST.energy}>
        ${sensorsByGroup.energy.map(id => html`<option value=${id}></option>`)}
      </datalist>
      <datalist id=${DATALIST.all}>
        ${sensorsByGroup.all.map(id => html`<option value=${id}></option>`)}
      </datalist>
      <div class="form">
        <div class="section-title">Nodes</div>
        <div class="hint">Clique sur une ligne pour configurer ses sensors et son apparence. Vide les <strong>deux</strong> sensors d'un node pour le masquer sur la carte (Maison reste obligatoire).</div>
        ${NODES.map(renderNode)}

        <details class="advanced-row">
          <summary class="advanced-summary">
            <ha-icon icon="mdi:palette"></ha-icon>
            <span>Apparence carte</span>
            <ha-icon class="node-chevron" icon="mdi:chevron-down"></ha-icon>
          </summary>
          <div class="advanced-body">
            <div class="hint">Couleur de fond de la carte. La bordure et la couleur du texte s'adaptent automatiquement (override possible).</div>
            ${colorField("Couleur de fond", this._config.background || "", "transparent", (ev) => this._bgChanged("background", ev))}
            ${colorField("Bordure (override)", this._config.border_color || "", "auto", (ev) => this._bgChanged("border_color", ev))}
            ${colorField("Texte (override)", this._config.text_color || "", "auto", (ev) => this._bgChanged("text_color", ev))}
          </div>
        </details>

        <details class="advanced-row">
          <summary class="advanced-summary">
            <ha-icon icon="mdi:tune"></ha-icon>
            <span>Options avancées</span>
            <ha-icon class="node-chevron" icon="mdi:chevron-down"></ha-icon>
          </summary>
          <div class="advanced-body">
            <div class="section-title">Tailles de police (px)</div>
            <div class="hint">Maison W/kWh sont mis à l'échelle automatiquement selon la valeur des boxes.</div>
            ${txt("Labels W sur les flèches", F.w_label_line ?? DEFAULT_FONTS.w_label_line, String(DEFAULT_FONTS.w_label_line), (ev) => this._fontsChanged("w_label_line", ev), "number")}
            ${txt("Valeurs W (boxes)", F.w_value ?? DEFAULT_FONTS.w_value, String(DEFAULT_FONTS.w_value), (ev) => this._fontsChanged("w_value", ev), "number")}
            ${txt("Valeurs kWh (boxes)", F.kwh_value ?? DEFAULT_FONTS.kwh_value, String(DEFAULT_FONTS.kwh_value), (ev) => this._fontsChanged("kwh_value", ev), "number")}

            <div class="section-title">Label en haut (optionnel)</div>
            <div class="hint">Affiché entre les boxes Import et Solaire. Laisse le texte vide pour ne rien afficher.</div>
            ${txt("Texte", T.text || "", "ex. Ma maison", (ev) => this._topLabelChanged("text", ev))}
            ${txt("Taille de police (px)", T.font_size ?? "", "24", (ev) => this._topLabelChanged("font_size", ev), "number")}
            ${colorField("Couleur", T.color || "", "#FFFFFF", (ev) => this._topLabelChanged("color", ev))}
          </div>
        </details>
      </div>
    `;
  }

  static get styles() {
    return css`
      .form { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
      .section-title { font-size: 14px; font-weight: 700; color: var(--primary-text-color); margin-top: 8px; }
      .section-title:first-child { margin-top: 0; }
      .hint { font-size: 12px; color: var(--secondary-text-color); margin: -4px 0 8px 0; }
      code { background: var(--code-editor-background-color, #2a2a2a); padding: 1px 4px; border-radius: 3px; }
      ha-icon-picker { width: 100%; }

      .field { display: flex; flex-direction: column; gap: 2px; width: 100%; }
      .field-label { font-size: 11px; font-weight: 600; color: var(--secondary-text-color); padding-left: 2px; }
      .field-input {
        font-family: inherit;
        font-size: 14px;
        color: var(--primary-text-color);
        background: var(--mdc-text-field-fill-color, var(--secondary-background-color, #f5f5f5));
        border: none;
        border-bottom: 1px solid var(--divider-color, #888);
        padding: 8px 8px 6px 8px;
        border-radius: 4px 4px 0 0;
        outline: none;
        width: 100%;
        box-sizing: border-box;
        min-height: 24px;
      }
      .field-input:focus {
        border-bottom: 2px solid var(--primary-color, #03a9f4);
        padding-bottom: 5px;
      }
      .field-input::placeholder { color: var(--secondary-text-color); opacity: 0.6; }
      /* Native <select> dropdown options follow OS color-scheme by default. Force
         the HA dark theme palette so the popup is legible. */
      select.field-input {
        color-scheme: light dark;
        appearance: none;
        -webkit-appearance: none;
        background-image:
          linear-gradient(45deg, transparent 50%, var(--primary-text-color) 50%),
          linear-gradient(135deg, var(--primary-text-color) 50%, transparent 50%);
        background-position:
          calc(100% - 16px) 50%,
          calc(100% - 11px) 50%;
        background-size: 5px 5px, 5px 5px;
        background-repeat: no-repeat;
        padding-right: 28px;
      }
      select.field-input option {
        background: var(--card-background-color, #1f1f1f);
        color: var(--primary-text-color, #f0f0f0);
      }

      /* Collapsible node rows */
      .node-row, .advanced-row {
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        background: var(--card-background-color, transparent);
        overflow: hidden;
      }
      .node-row[open], .advanced-row[open] {
        background: var(--secondary-background-color, rgba(127,127,127,0.05));
      }
      .node-summary, .advanced-summary {
        list-style: none;
        cursor: pointer;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        user-select: none;
      }
      .node-summary::-webkit-details-marker, .advanced-summary::-webkit-details-marker { display: none; }
      .node-summary:hover, .advanced-summary:hover { background: var(--secondary-background-color, rgba(127,127,127,0.08)); }
      .node-summary-icon { --mdc-icon-size: 28px; color: var(--primary-text-color); flex-shrink: 0; }
      .node-summary-text { flex: 1; min-width: 0; }
      .node-summary-title { font-size: 14px; font-weight: 700; color: var(--primary-text-color); display: flex; align-items: center; gap: 6px; }
      .optional-tag { font-size: 10px; font-weight: 600; padding: 2px 6px; background: var(--divider-color); color: var(--secondary-text-color); border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
      .node-summary-info { font-size: 12px; color: var(--secondary-text-color); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .missing { color: var(--warning-color, #f59e0b); font-style: italic; }
      .node-chevron { --mdc-icon-size: 20px; color: var(--secondary-text-color); transition: transform 0.2s ease; flex-shrink: 0; }
      .node-row[open] .node-chevron, .advanced-row[open] .node-chevron { transform: rotate(180deg); }
      .node-body, .advanced-body {
        padding: 8px 12px 14px 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        border-top: 1px dashed var(--divider-color);
      }

      .advanced-summary { font-weight: 700; }
      .advanced-summary > ha-icon:first-child { --mdc-icon-size: 22px; color: var(--primary-text-color); }
      .advanced-summary > span { flex: 1; font-size: 14px; color: var(--primary-text-color); }
      .advanced-row { margin-top: 12px; }

      /* Interactions row inside a node body — nested look, lighter than the node itself. */
      .interactions-row {
        border: 1px dashed var(--divider-color);
        border-radius: 6px;
        background: var(--card-background-color, transparent);
        margin-top: 4px;
      }
      .interactions-row[open] { background: var(--secondary-background-color, rgba(127,127,127,0.05)); }
      .interactions-summary {
        list-style: none;
        cursor: pointer;
        padding: 8px 10px;
        display: flex;
        align-items: center;
        gap: 8px;
        user-select: none;
        font-size: 13px;
        font-weight: 600;
        color: var(--primary-text-color);
      }
      .interactions-summary::-webkit-details-marker { display: none; }
      .interactions-summary > ha-icon:first-child { --mdc-icon-size: 18px; color: var(--secondary-text-color); }
      .interactions-summary > span { flex: 1; }
      .interactions-row[open] .node-chevron { transform: rotate(180deg); }
      .interactions-body {
        padding: 6px 10px 12px 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        border-top: 1px dashed var(--divider-color);
      }

      /* Color picker */
      .color-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
      .color-swatch {
        width: 56px;
        height: 36px;
        border: 1px solid var(--divider-color);
        border-radius: 6px;
        cursor: pointer;
        padding: 2px;
        background: transparent;
        flex-shrink: 0;
      }
      .color-swatch::-webkit-color-swatch { border-radius: 4px; border: none; }
      .color-swatch::-moz-color-swatch { border-radius: 4px; border: none; }
      .color-hex {
        font-family: ui-monospace, monospace;
        font-size: 13px;
        font-weight: 600;
        color: var(--primary-text-color);
        background: var(--secondary-background-color, rgba(127,127,127,0.08));
        padding: 4px 8px;
        border-radius: 4px;
        flex: 1;
        text-align: center;
        letter-spacing: 0.5px;
      }
      .color-reset {
        width: 32px; height: 32px;
        border: 1px solid var(--divider-color);
        border-radius: 6px;
        background: transparent;
        color: var(--secondary-text-color);
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        flex-shrink: 0;
      }
      .color-reset:not(:disabled):hover { background: var(--secondary-background-color); color: var(--primary-text-color); }
      .color-reset:disabled { opacity: 0.35; cursor: not-allowed; }
      .field-default { font-size: 10px; font-weight: 500; color: var(--secondary-text-color); font-style: italic; }
    `;
  }
}

customElements.define("flux-energie-card-editor", FluxEnergieCardEditor);

// =========================================================================
// Register in customCards
// =========================================================================
window.customCards = window.customCards || [];
window.customCards.push({
  type: "flux-energie-card",
  name: "Flux Énergie",
  description: "Hub-and-spoke energy flow visualization with autarky ring + UI editor",
  preview: false,
});
