# Flux Énergie Card

A custom Lovelace card for Home Assistant that visualizes household energy flow as a hub-and-spoke diagram with an **autarky ring** at the center and animated arrows whose speed scales with power.

![Flux Énergie Card running on a live dashboard](docs/preview-card.png)

## Features

- **Hub-and-spoke layout**: a central Maison ring with up to **7 surrounding nodes** — Solar, Grid Import, Grid Export, Cumulus (water heater / PV-router), EV charger, **Box+** (mid-right, battery-capable) and **Box++** (bottom-center, generic mono)
- **Every spoke is optional** — pick only the ones you have. A node disappears entirely (box, arrow, animations) as soon as you clear both its sensors
- **Autarky ring** around the Maison: animated, color-shifts green → amber → red as self-consumption drops
- **Animated flows**: arrow speed scales with power magnitude; idle flows are dimmed, not removed
- **Box+ has two modes**:
  - **Mono** — generic W + kWh box for any extra circuit (pool pump, heat pump, second EV…)
  - **Battery** — auto-detected charge/discharge direction (the arrow flips!), SoC %, daily ↑/↓ kWh. Accepts either a signed power sensor (`+` charge / `−` discharge) or two split sensors (`charge_w` / `discharge_w`)
- **Box++ (mono only)** — second optional consumer at the bottom-center slot, useful for any extra load (fridge, dehumidifier, server, NAS…) that should not occupy the battery-capable Box+ slot
- **Custom background + auto-tinted border & text** — set `background` to any CSS color and the border/text automatically adapt for contrast (overrides also available)
- **Per-node tap_action / hold_action** — every node supports the standard HA action schema (`more-info`, `toggle`, `navigate`, `url`, `call-service`, `none`) with card-level defaults
- **Mobile scroll-vs-tap fix** — touchmove of more than 10 px aborts the press so vertical scrolling no longer triggers the more-info popup
- **Built-in visual editor** — no YAML required: pick sensors per node, customize colors, labels, icons, background and interactions, all from the dashboard
- Pure inline SVG — no external assets, no canvas, no `iframe`

## Installation

### HACS (custom repository) — recommended

1. In HACS → ⋮ menu → **Custom repositories**
2. Add `https://github.com/akunia/ha-flux-energie` with type **Dashboard** (this used to be called "Lovelace" in older HACS versions)
3. Install **Flux Énergie Card** from the list
4. Hard-refresh your browser (Ctrl + Shift + R)

The Lovelace resource is auto-registered by HACS.

### Manual

1. Copy `flux-energie-card.js` into `<config>/www/`
2. **Settings → Dashboards → ⋮ → Resources** → add `/local/flux-energie-card.js?v=0.9.3` as a *JavaScript module*
3. Hard-refresh your browser

## Configure with the visual editor

This is the recommended workflow — no YAML.

1. **Edit dashboard** → **+ Add card** → search for **Flux Énergie**
2. The editor lists each node (Maison, Solaire, Import grid, Export grid, Cumulus, Voiture, Box+ mid-right, Box++ bottom-center). Click a node to expand it.
3. For each node you want, pick a **W** sensor and a **kWh** sensor. Sensor pickers are filtered by `unit_of_measurement` so you only see relevant entities.
4. **To hide a node, leave both its sensors empty.** It will disappear from the preview immediately. Maison is the only mandatory node.
5. For **Box+**, pick **Mode** at the top of its section: *Mono* (single W/kWh) or *Battery* (charge/discharge + SoC + daily ↑/↓ kWh). **Box++** is always mono.
6. Each non-Maison node also exposes **Label**, **Color**, **Icon** and an **Interactions** sub-section (tap / hold action) directly in the editor.
7. The **Apparence carte** advanced section lets you set the card background, border and text color — the border and text auto-tint from the background unless you override them.
8. The "Options avancées" section adds font sizes and an optional top label.

That's it.

## YAML reference

For users who prefer YAML or need an option not surfaced by the editor.

### Entity slots

All slots are optional except `house_consumption` / `house_daily_kwh`. A spoke is rendered if at least one of its two sensors is set.

| Node                       | Position      | W sensor              | kWh sensor              |
| -------------------------- | ------------- | --------------------- | ----------------------- |
| Maison (mandatory)         | centre        | `house_consumption`   | `house_daily_kwh`       |
| Solaire                    | top-right     | `pv_production`       | `pv_daily_kwh`          |
| Import grid                | top-left      | `grid_import`         | `grid_daily_import`     |
| Export grid                | bottom-right  | `grid_export`         | `grid_daily_export`     |
| Cumulus                    | mid-left      | `pvrouter_surplus`    | `pvrouter_daily`        |
| Voiture                    | bottom-left   | `ev_charger_power`    | `ev_daily`              |
| Box+ (mono or battery)     | mid-right     | `extra_w` (signed in battery mode) OR `extra_charge_w` + `extra_discharge_w` | `extra_kwh` (mono) / `extra_charged_kwh` + `extra_discharged_kwh` + `extra_soc` (battery) |
| **Box++** (mono only)      | bottom-center | `extra2_w`            | `extra2_kwh`            |

### Minimal example (Maison + Solaire only)

```yaml
type: custom:flux-energie-card
entities:
  house_consumption: sensor.house_w
  house_daily_kwh:   sensor.house_kwh
  pv_production:     sensor.pv_w
  pv_daily_kwh:      sensor.pv_kwh
```

### Box+ as a Mono box

```yaml
type: custom:flux-energie-card
entities:
  house_consumption: sensor.house_w
  house_daily_kwh:   sensor.house_kwh
  extra_w:   sensor.pool_pump_w
  extra_kwh: sensor.pool_pump_kwh
extra:
  type:  mono
  label: PISCINE
  icon:  mdi:pool
  color: "#0EA5E9"
```

### Box+ as a Battery box

![Battery mode — charge / discharge / split-sensors / mono regression](docs/preview-battery-modes.jpeg)

```yaml
type: custom:flux-energie-card
entities:
  house_consumption: sensor.house_w
  house_daily_kwh:   sensor.house_kwh
  # Either a signed sensor:
  extra_w: sensor.battery_power_signed
  # Or two split sensors (preferred when your inverter exposes them separately):
  # extra_charge_w:    sensor.battery_charge_w
  # extra_discharge_w: sensor.battery_discharge_w
  extra_soc:            sensor.battery_soc
  extra_charged_kwh:    sensor.battery_charged_today
  extra_discharged_kwh: sensor.battery_discharged_today
extra:
  type:            battery
  charge_color:    "#10B981"   # emerald — default
  discharge_color: "#A855F7"   # violet — default
```

The card auto-picks split mode if either `extra_charge_w` or `extra_discharge_w` is non-zero, otherwise it falls back to the signed `extra_w`.

### Box++ (bottom-center, mono only)

Use this slot for any additional consumer you want to visualize separately from the rest of the house, without competing with the Box+ slot reserved for a (current or future) battery.

```yaml
type: custom:flux-energie-card
entities:
  house_consumption: sensor.house_w
  house_daily_kwh:   sensor.house_kwh
  extra2_w:   sensor.fridge_power_w
  extra2_kwh: sensor.fridge_energy_kwh
extra2:
  label: FRIGO
  icon:  mdi:fridge-outline
  color: "59,130,246"   # sky-500
```

Box++ has no battery mode — it's strictly a mono consumer.

### Card background, border & text colors

Set a custom card surface; the border and text auto-derive for contrast.

```yaml
type: custom:flux-energie-card
entities: { … }
background:   "#1a1d26"   # any CSS color or full background shorthand
# Optional explicit overrides — defaults are auto-derived from background:
border_color: "#2c2f3a"   # auto: ~20% text-color mix into background
text_color:   "#f1f5f9"   # auto: white on dark bg, near-black on light bg
```

When `background` is a single solid color, the card flips both text colors via a luminance probe so the numbers stay readable. Gradients and `var(...)` values skip the auto-flip and the HA theme defaults are kept.

### Per-node tap_action / hold_action

Each node accepts the standard Home Assistant action schema. If you don't set anything, the default behaviour applies (more-info on the W entity for a tap, more-info on the kWh entity for a long press of ≥ 500 ms).

```yaml
type: custom:flux-energie-card
entities: { … }
# Card-level defaults (apply to any node without per-node overrides):
tap_action:
  action: more-info
hold_action:
  action: none
# Per-node overrides (any subset):
nodes:
  voiture:
    tap_action:
      action: navigate
      navigation_path: /lovelace/car
  solaire:
    tap_action:
      action: call-service
      service: light.toggle
      service_data:
        entity_id: light.solar_indicator
  maison:
    hold_action:
      action: url
      url_path: https://your.energy.dashboard
```

Supported `action` values: `more-info`, `toggle`, `navigate`, `url`, `call-service`, `none`. Tap is also aborted on mobile when a touch moves by more than 10 px (so vertical scrolling no longer triggers a popup).

### Customization

All overrides are optional. Colors accept either an `r,g,b` string or a `#rrggbb` hex.

```yaml
colors:
  solaire: "#F59E0B"
  import:  "#F43F5E"
  export:  "#10B981"
  cumulus: "#0EA5E9"
  voiture: "#8B5CF6"
labels:
  solaire: PHOTOVOLTAÏQUE
  voiture: WALLBOX
icons:
  solaire: mdi:solar-power-variant
  maison:  mdi:home-modern
fonts:
  w_label_line: 25   # W labels on the arrows
  w_value:      26   # W value inside boxes
  kwh_value:    15   # kWh value inside boxes
top_label:
  text:      "Ma maison"
  font_size: 24
flow_style:
  active_opacity:        1.0
  inactive_opacity:      0.45
  active_stroke_width:   4
  inactive_stroke_width: 2.5
  inactive_color_mix:    100   # 0–100, blend toward card background when < 100
```

The Maison central display scales automatically — `fonts.*` only affect the surrounding boxes.

## Tips

- **Click** any box → opens the W entity's more-info dialog.
- **Long-press** (≥500 ms) any box → opens the kWh entity instead.
- **Battery split vs signed** — use split mode when your inverter exposes only positive `charge_w` / `discharge_w` (common with Solis, Huawei). Use signed mode when your inverter exposes a single `+/−` value (Sungrow, some Victron setups).
- **Noisy power sensors** — values display from 1 W upward. If you see arrow flicker around 0 ↔ 1 W, smooth it upstream with a template sensor that snaps anything below ~2 W to 0.

## License

MIT — see [LICENSE](LICENSE).
