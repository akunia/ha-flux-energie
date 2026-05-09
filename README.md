# Flux Énergie Card

A custom Lovelace card for Home Assistant that visualizes household energy flow as a hub-and-spoke diagram with an **autarky ring** at the center and animated arrows whose speed scales with power. An optional **Battery box** auto-detects charge / discharge direction, displays SoC % and daily ↑/↓ kWh.

![Battery modes preview](docs/preview-battery-modes.jpeg)

## Features

- **5 spoke nodes** around a central Maison ring: Solar, Grid Import, Grid Export, Cumulus (water heater / PV-router), EV charger — each independently optional (clear both its sensors to hide it)
- **Autarky ring**: animated ring around the house showing self-consumption %, color shifts green → amber → red
- **Animated flows**: arrow speed scales with power magnitude (log curve, capped); inactive flows are dimmed
- **Optional 6th box (Box+)** with two modes:
  - **Mono** — generic W + kWh box (e.g. pool pump, heat pump, second EV…)
  - **Battery** — auto-detected charge/decharge direction (arrow flips!), SoC %, daily ↑/↓ kWh. Accepts either a signed power sensor (+ charge / − discharge) or two split sensors (`charge_w` / `discharge_w`)
- **Built-in UI editor** — configure entities, colors, icons, labels and fonts without writing YAML
- **Click & long-press** on any node opens the relevant entity's more-info dialog
- Pure inline SVG — no external assets, no canvas, no `iframe`

## Installation

### HACS (custom repository)

1. In HACS → **Frontend** → ⋮ menu → **Custom repositories**
2. Add `https://github.com/akunia/ha-flux-energie` with category **Lovelace**
3. Install **Flux Énergie Card** from the list
4. Restart Home Assistant or hard-refresh your browser (Ctrl+Shift+R)

The resource is auto-registered by HACS. If you prefer, add it manually in **Settings → Dashboards → ⋮ → Resources** as `/hacsfiles/ha-flux-energie/flux-energie-card.js` (JS module).

### Manual

1. Copy `flux-energie-card.js` into `<config>/www/`
2. Add a Lovelace resource: `/local/flux-energie-card.js?v=0.8.0` (JS module)
3. Hard-refresh your browser

## Quick start (visual editor)

Add a card → search for **Flux Énergie** → fill in your sensors per node. The editor groups sensors per node and offers filtered datalists per unit (W / kWh).

## Configuration (YAML)

### Required entities

```yaml
type: custom:flux-energie-card
entities:
  pv_production:     sensor.pv_production_w
  house_consumption: sensor.house_consumption_w
  grid_import:       sensor.grid_import_w
  grid_export:       sensor.grid_export_w
  pvrouter_surplus:  sensor.cumulus_w        # any "diversion" load also works
  ev_charger_power:  sensor.ev_power_w
  pv_daily_kwh:      sensor.pv_daily_kwh
  house_daily_kwh:   sensor.house_daily_kwh
  grid_daily_export: sensor.grid_export_kwh
  grid_daily_import: sensor.grid_import_kwh
  pvrouter_daily:    sensor.cumulus_kwh
  ev_daily:          sensor.ev_charged_kwh
```

### Optional 6th box — Box+

Add an extra box on the mid-right, mirroring the Cumulus position on the left.

#### Mono mode (default)

A simple W + kWh box. Use for any extra circuit you want to track.

```yaml
entities:
  # ... required entities above ...
  extra_w:   sensor.pool_pump_w
  extra_kwh: sensor.pool_pump_daily_kwh
extra:
  type:  mono
  label: PISCINE
  icon:  mdi:pool
  color: "14,165,233"   # rgb string, or hex "#0EA5E9"
```

#### Battery mode

Auto-detects direction (charging → maison-to-box arrow; discharging → box-to-maison arrow), inverts colors (green / violet by default), and shows SoC % + daily ↑/↓ kWh.

```yaml
entities:
  # ... required entities above ...
  # Either a signed power sensor (+ charge / − discharge):
  extra_w: sensor.battery_power_signed
  # OR two split sensors (any of these > 0 wins over signed):
  # extra_charge_w:    sensor.battery_charge_w
  # extra_discharge_w: sensor.battery_discharge_w
  extra_soc:            sensor.battery_soc          # %
  extra_charged_kwh:    sensor.battery_charged_today_kwh
  extra_discharged_kwh: sensor.battery_discharged_today_kwh
extra:
  type:            battery
  label:           BATTERIE
  icon:            mdi:battery
  charge_color:    "16,185,129"   # emerald — default
  discharge_color: "168,85,247"   # violet — default
```

The card auto-picks split mode if either `extra_charge_w` or `extra_discharge_w` is non-zero, otherwise it falls back to the signed `extra_w`.

## Customization

All overrides are optional.

### Colors

Per-node overrides accept either a `r,g,b` string or a `#rrggbb` hex:

```yaml
colors:
  solaire: "#F59E0B"
  import:  "244,63,94"
  export:  "#10B981"
  cumulus: "#0EA5E9"
  voiture: "#8B5CF6"
```

### Labels

```yaml
labels:
  solaire: PHOTOVOLTAÏQUE
  import:  RÉSEAU
  export:  REVENTE
  cumulus: BALLON
  voiture: WALLBOX
```

### Icons (any MDI)

```yaml
icons:
  solaire: mdi:solar-power-variant
  import:  mdi:transmission-tower-import
  export:  mdi:transmission-tower-export
  cumulus: mdi:water-boiler
  voiture: mdi:ev-station
  maison:  mdi:home-modern
```

### Fonts (px)

The Maison central display scales automatically; these only affect the boxes around it.

```yaml
fonts:
  w_label_line: 25   # W labels on the arrows
  w_value:      26   # W value inside boxes
  kwh_value:    15   # kWh value inside boxes
```

### Top label (optional)

Displayed between the Import and Solar boxes.

```yaml
top_label:
  text:      "Ma maison"
  font_size: 24
  color:     "#FFFFFF"
```

### Flow style

```yaml
flow_style:
  active_opacity:        1.0
  inactive_opacity:      0.45
  active_stroke_width:   4
  inactive_stroke_width: 2.5
  active_dasharray:      "7 9"
  inactive_dasharray:    "7 9"
  inactive_color_mix:    100   # 0–100, blend toward card background when < 100
```

## Full example

```yaml
type: custom:flux-energie-card
entities:
  pv_production:     sensor.pv_production_w
  house_consumption: sensor.house_consumption_w
  grid_import:       sensor.grid_import_w
  grid_export:       sensor.grid_export_w
  pvrouter_surplus:  sensor.cumulus_w
  ev_charger_power:  sensor.ev_power_w
  pv_daily_kwh:      sensor.pv_daily_kwh
  house_daily_kwh:   sensor.house_daily_kwh
  grid_daily_export: sensor.grid_export_kwh
  grid_daily_import: sensor.grid_import_kwh
  pvrouter_daily:    sensor.cumulus_kwh
  ev_daily:          sensor.ev_charged_kwh
  extra_w:              sensor.battery_power_signed
  extra_soc:            sensor.battery_soc
  extra_charged_kwh:    sensor.battery_charged_today_kwh
  extra_discharged_kwh: sensor.battery_discharged_today_kwh
extra:
  type:  battery
  label: BATTERIE
top_label:
  text: "Ma maison"
```

## Tips

- **Hide a node** — clear *both* its W and kWh entities in the editor (or remove the keys from YAML). Maison stays mandatory; the rest are independently optional.
- **Click** any box → opens the W entity's more-info dialog.
- **Long-press** (≥500 ms) any box → opens the kWh entity instead.
- **Battery split vs signed mode** — useful when your inverter exposes only positive `charge_w` and positive `discharge_w` (common with Solis, Huawei, etc.). For inverters that expose a signed value (Sungrow, some Victron setups), just use `extra_w`.
- **Threshold** — values are displayed as soon as the sensor reports > 0 W. If your sensor is noisy and you see flickering animation, smooth it upstream (template sensor with a 1–2 W deadband).

## License

MIT — see [LICENSE](LICENSE).
