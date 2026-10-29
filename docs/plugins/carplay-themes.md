# CarPlay displays and themes

This guide covers the receiver's display geometry, the Mac player's dashboard, and the experimental CarPlay Ultra theme probe. It also proposes a format for locally composed themes. The current receiver does **not** install arbitrary themes on an iPhone.

## What can be customized today

| Surface | Current control | Scope |
| --- | --- | --- |
| Main CarPlay projection (stream 110) | `--width`, `--height`, `--fps`, `--ui-scale` on the receiver | Negotiated at the next CarPlay connection. The player preserves the decoded video ratio. |
| Cluster map (stream 111) | `ZINC_CARPLAY_CLUSTER=1`, then `ZINC_CARPLAY_CLUSTER_WIDTH` and `ZINC_CARPLAY_CLUSTER_HEIGHT` | The iPhone chooses what to project; navigation must be active. Even dimensions from 64 to 4096. |
| Day and night | Player **Day/Night** button | Sends an appearance command to the iPhone; app and map support varies. The local simulated dashboard follows it. |
| Local Zinc dashboard and HUD | `examples/carplay/src/components/VehicleDashboard.tsx` and `HudPanel.tsx` | Freely editable Zinc UI. Gauges use simulated or received data as labelled. |
| iPhone CarPlay wallpaper | iPhone CarPlay Settings | Standard CarPlay wallpaper is selected on the phone, not by a Zinc theme file. |
| Experimental Ultra catalog profile | `ZINC_CARPLAY_ULTRA_THEME=44C9FA31EC:985` with cluster and UI Sync enabled | Fixed asset and layout identifier; no theme picker or artwork composition yet. |

For a classic cluster, set the environment **before starting the receiver**:

```sh
ZINC_CARPLAY_CLUSTER=1 \
ZINC_CARPLAY_CLUSTER_WIDTH=1280 \
ZINC_CARPLAY_CLUSTER_HEIGHT=480 \
plugins/carplay/backend/run --wireless --airplay-port 17000 --http-port 18080
```

Reconnect the iPhone after a geometry change. The experimental Ultra profile overrides both announced canvases to **1920 × 720**. Its current cluster layout is `Cobranded`; its center map input occupies a **600 × 480** zone at `(660, 120)` on that canvas. Stretching that zone to 1920 × 720 distorts the map. The player currently fits it within the dashboard instead.

## How a local theme should be created

A local theme is a Zinc presentation of data already received or simulated by the player. Keep the projection video as an independent layer, and draw instruments, media, navigation and wallpaper in Zinc. This avoids implying that the phone has adopted a custom package.

1. Choose a canvas and safe areas for the main screen and cluster. Design in normalized coordinates, then fit each surface to its actual decoded dimensions. The cluster may differ from the advertised dimensions.
2. Choose day and night colors with sufficient contrast. The local Day/Night state can select between them; it does not guarantee that every iPhone app changes its map.
3. Assign data sources explicitly: iAP2 navigation and Now Playing when provided, stream 111 for the phone's cluster map, and local vehicle presets for unsupported gauges. Show stale or unavailable data instead of retaining an old value.
4. Add assets that Zinc can render locally, with rights to use them. Do not copy a CarDDP package into the app or assume Core Animation bundles can be rendered by Zinc.
5. Implement the composition in `examples/carplay/src/components/VehicleDashboard.tsx`, or extract a reusable theme component alongside it. Use `HudPanel.tsx` for a compact overlay. Check 16:6, 16:9 and narrow window sizes and both appearance modes.

A future local theme manifest could use this shape; it is a **design proposal**, not a parser supported by the current player:

```json
{
  "id": "night-instrument",
  "canvas": { "width": 1920, "height": 720 },
  "palette": {
    "day": { "background": "#edf1f4", "foreground": "#142332", "accent": "#007c9a" },
    "night": { "background": "#080e18", "foreground": "#edf4ff", "accent": "#63d8ef" }
  },
  "zones": {
    "left": [30, 30, 600, 600],
    "map": [660, 120, 600, 480],
    "right": [1290, 30, 600, 600]
  }
}
```

These zones mirror the experimental Cobranded package's geometry. A real manifest loader would need validation of bounds, asset loading, safe areas, text scaling, fallback content and persistence before the player could offer a theme switcher.

## Four proposed themes

| Theme | Visual direction | Suggested layout | Best use |
| --- | --- | --- | --- |
| **Route claire** | Warm white, graphite labels, cyan route accent | Large center map, restrained speed and fuel | Day driving and legible navigation |
| **Instrument nuit** | Near-black, cool blue needles, low-glare amber alerts | Two circular gauges around a compact map | Dark roads and detailed vehicle telemetry |
| **Cartographie panoramique** | Dark topographic texture, translucent information cards | Wide map with small media and next-turn cards | Route overview on the Mac display |
| **Studio média** | Album-art color wash, large track and artist, small navigation strip | Media focus with persistent speed and maneuver | Music testing and passenger display |

These are designs for the **Zinc player**. They do not change the iPhone's built-in CarPlay icons, Voiture/Radio/Climat apps, or the phone's cluster renderer. The latter apps need their corresponding vehicle and radio services; their current presence in the app grid does not mean those services are implemented.

## CarPlay Ultra package boundary

Apple describes CarPlay Ultra as an automaker-integrated experience with multiple displays, customizable instrument clusters and vehicle controls. The catalog asset inspected for this experiment contains `Center_Display` and `Cluster_Display`, layout identifiers, palettes, wallpapers, zones and Core Animation assets. Its Cobranded cluster layout offers only `dynamicColor`: black at night and `#f2f2f2` by day. Other catalog layouts contain gradient, landscape or topography wallpapers, but Zinc does not currently compose their assets. An asset ID, matching geometry and accepted UI Sync messages do not establish that an arbitrary package can be authored and installed through this receiver. The package signature chain has not been independently verified.

Sources: [Apple CarPlay Ultra announcement](https://www.apple.com/newsroom/2025/05/carplay-ultra-the-next-generation-of-carplay-begins-rolling-out-today/), [Apple WWDC24 CarPlay design session](https://developer.apple.com/videos/play/wwdc2024/10112/), [Apple CarPlay developer overview](https://developer.apple.com/carplay/), [Apple CarPlay wallpaper help](https://support.apple.com/en-hk/guide/iphone/iph6ade13329/26/ios/26), and the [local Ultra feasibility report](../reports/zinc-next-carplay-ultra-feasibility.md).

## Receiver and paired devices in the player

Open **Appareils** in the Mac player. While it is visible, the authenticated receiver connection refreshes server and pairing status every second. It shows CarPlay session, iAP2, GPS subscription, cluster/theme flags, uptime, the iPhone name and model identifier, and paired identifiers. Known iPhone 17 family identifiers are shown with a readable name using the [AppleDB device list](https://appledb.dev/device-selection/iPhone); unknown models retain the identifier received from AirPlay. Battery percentage comes from an iAP2 `PowerUpdate` (0xAE01) only when the phone supplies a valid 0–100 value; otherwise the panel says **non reçue**. Click **Désappairer**, then **Confirmer** on one exact identifier. The receiver pauses automatic wireless invitations and closes its current session before deleting that Bluetooth or AirPlay record. **Relancer la connexion** resumes invitations. On macOS, the server cannot inspect Linux BlueZ pairings, so the panel reports AirPlay records only. The receiver token protects these WebSocket commands; keep the token private.

The [Linux pairing CLI](../../plugins/carplay/backend/linux/pairings) remains available when the receiver is stopped. It can list and remove exact records independently of the player. If the Bluetooth and AirPlay IDs differ, remove each one you intend to forget. Pairing removal cannot revoke a trust record retained on the iPhone; use iPhone CarPlay and Bluetooth settings to clear that side when needed.
