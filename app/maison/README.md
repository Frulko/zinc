# Maison — a Figma storyboard with a native Zinc controller

[Figma file](https://www.figma.com/design/9cmBj0SLj0e5RhpkFF7OqZ): editable tablet,
portrait and phone screens, palette variables, Manrope text styles, component
instances, prototype links and an introductory fade. Photographs are content assets;
text and icons stay native text and SVG.

Run from this checkout:

```sh
ZINC_BACKGROUND=1 build/zinc run app/maison --interp
tools/figma-live --zinc /path/to/zinc --app-project app/maison/live --design app/maison/design/figma-document.json
```

In Figma, open the development plugin, paste the live pairing link and select
`Maison / Overview / Tablet`. **Connecteurs · TypeScript** shows the native controls,
text outlets, action keys, code examples and emitted events. Change the viewport to
switch between the three overview breakpoints. The device list also adapts to these three formats.

The app starts with simulated devices. Settings opens an address and password-masked
Home Assistant token form. The token stays in memory. The client authenticates over
the native WebSocket plugin, subscribes to compact entity deltas, reconnects and
sends service calls. A rejected token stops reconnection. There is no cloud relay.
Lights, a thermostat, a cover and an energy sensor populate dashboard roles;
open a device to associate it explicitly. Scene entities can be associated with the
four scene buttons. Associations reset when the app restarts. Unsupported entity
domains remain readable in the device list.

`controller.tsx` owns application behavior; `client.ts` owns transport and entity
state. The Figma component-key registry is `integrations/figma/components.json`.
See [the bridge guide](../../docs/figma-ui.md) for Slider, Switch, VirtualList and
sticky ScrollView contracts. Generated visual nodes are replaced by existing Zinc
controls, with their keyboard, pointer and accessibility behavior.

**Exporter le projet…** includes the controller and client using the local trusted
`live/figma-export.json` manifest. Its output runs independently of this checkout,
Figma and Live with a compatible Zinc binary. It contains named TSX components,
connector stubs, design metadata, referenced media, real fonts and license files.
Each export creates a new directory; it does not merge later design changes into
edited source. `assets/storyboard.json` is the checked-in standalone snapshot.

Photos and icon/font licenses are listed in `assets/SOURCES.md`,
`assets/Lucide-LICENSE.txt` and the copied Manrope OFL. JPEG validation uses Pillow
(`python3 -m pip install Pillow` if absent). Weather and the small energy chart are
illustrations, not fetched history. Live Home Assistant hardware/network operation
has not been verified; protocol behavior is covered with simulated messages.

Validation: `ZINC=/path/to/zinc tests/run --only maison` covers native controls,
virtualized rows, sticky chat behavior, protocol deltas, responsive storyboard
bounds and a full standalone TSX export of the real Figma snapshot.
