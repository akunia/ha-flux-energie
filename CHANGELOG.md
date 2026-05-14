# Changelog

All notable changes to **flux-energie-card** are documented here. This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.3] — 2026-05-14

This release groups every change made on top of `0.8.0` in response to the [HACF community feedback thread](https://forum.hacf.fr/t/carte-visualisation-flux-energetique-hub-maison-central-avec-fleches-animees-svg-inline-sur-button-card/79568), plus a new optional bottom-center slot so a generic 7th consumer can be visualised without competing with the battery-capable Box+.

### Added

- **Box++ (bottom-center) slot** for a generic 7th consumer (fridge, dehumidifier, NAS, server, …). Driven by `extra2_w` / `extra2_kwh` entities and an `extra2:` appearance block (label, icon, color). The slot is mono-only and lives between Voiture (bottom-left) and Export grid (bottom-right), leaving Box+ at mid-right free for a (current or future) battery.
- **Card background customization** via `background` (any CSS color or full background shorthand). The border is auto-tinted from the background using `color-mix()`, and the text color flips between near-white and near-black based on a luminance probe so values stay readable on any solid background. Both can still be overridden explicitly via `border_color` and `text_color`.
- **Per-node `tap_action` / `hold_action`** following the standard Home Assistant action schema (`more-info`, `toggle`, `navigate`, `url`, `call-service`, `none`). Configurable via `nodes.<key>.tap_action` (per-node) or top-level `tap_action` / `hold_action` (card-level default). When nothing is configured, the original behavior is preserved (more-info on the W entity for a tap, more-info on the kWh entity for a long press of ≥ 500 ms).
- **Visual editor — new sections.** Each node now exposes a collapsible *Interactions* sub-section with an action-type select and a context-sensitive parameter input. A new *Apparence carte* advanced section adds color pickers for the card background, border, and text.

### Changed

- **Mobile scroll-vs-tap disambiguation.** A `touchmove` of more than 10 px during a press now aborts it, so vertical scrolling on mobile no longer triggers the more-info popup (forum request from `pascal_ha`).
- **W labels on arrows** now use a single text node with the unit appended (`"123 W"`), removing a `<tspan dx>` that introduced a subtle baseline drift between the digits and the unit.
- **Native `<select>` dropdown styling** in the editor — options now follow the HA dark theme (`--card-background-color`, `--primary-text-color`) instead of the browser's default light popup, and the chevron is rendered via CSS for consistency.
- **Box+ slot title** in the editor changed from "réservée batterie" to "compatible batterie" — the slot is generic, battery is just one supported mode.
- **`triggers_update` config key** is now silently accepted as a no-op (with a `console.debug` note). It was a `custom:button-card` v6 directive; this card is reactive via LitElement and refreshes automatically on `hass` state changes, so the key has no effect, but YAML imported from older forum posts no longer breaks.

### Layout

The bottom-center Box++ uses a new ring exit `m_bot_C` and a dedicated arrow `path_maison_to_extra2`. Its W label sits at `xC + 80` so it clears the vertical arrow even with four-digit values.

## [0.8.0] — Initial public release

- Hub-and-spoke layout: Maison ring + 5 fixed nodes (Solaire / Import / Export / Cumulus / Voiture) + optional Box+ at mid-right.
- Autarky ring with green → amber → red color thresholds.
- Animated arrows with speed scaling by power magnitude.
- Box+ supports mono and battery modes (auto-detected charge/discharge direction).
- Built-in visual editor (no YAML required).
- Click and long-press on any node open the relevant entity's more-info dialog.
