# CarPlay displays and themes

This guide covers the receiver's display geometry, the Mac player's dashboard, and the experimental CarPlay Ultra theme probe. It also proposes a format for locally composed themes. The current receiver does **not** install arbitrary themes on an iPhone.

## Who draws the Ultra dashboard

Apple's [WWDC24 architecture session](https://developer.apple.com/videos/play/wwdc2024/10111/) separates **Remote UI** (video from iPhone, such as maps), **Local UI** (gauges drawn by the vehicle from an authenticated asset and behavior-script package transferred during pairing), vehicle-rendered overlay/punch-through layers, and **UI Sync** (the commands and timing that align the layers). The iPhone's theme selector is a preview of the combined result; the selected palette identifier alone is not a finished cluster image. Our receiver decodes streams 110 and 111 and acknowledges UI Sync, but does not yet fetch, verify, execute or composite the Apple Local UI package. Zinc therefore draws its own clearly labelled dashboard approximation.

A live stream 111 can contain a decoded black placeholder even while frames arrive. The Mac player samples the decoded map zone and keeps its contour background visible until guidance, a phone layout choice and nonblack pixels are present. The Debug panel reports whether that zone is visible, black or unavailable. This is a black-placeholder check, not a semantic map detector; a nonblack placeholder can still pass it. The independent cluster preview remains useful for inspecting the raw stream.

The receiver writes each decoded UI Sync command type and its bounded values to the `ui-sync` log. Change a theme on the iPhone while watching that log to establish whether the phone sent a layout or palette selection; an advertised UI Sync capability alone does not prove a choice arrived.

## What can be customized today

| Surface | Current control | Scope |
| --- | --- | --- |
| Main CarPlay projection (stream 110) | `--width`, `--height`, `--fps`, `--ui-scale` on the receiver | Negotiated at the next CarPlay connection. The player preserves the decoded video ratio. |
| Cluster map (stream 111) | `ZINC_CARPLAY_CLUSTER=1`, then `ZINC_CARPLAY_CLUSTER_WIDTH` and `ZINC_CARPLAY_CLUSTER_HEIGHT` | The iPhone chooses what to project; navigation must be active. Even dimensions from 64 to 4096. |
| Day and night | Player **Day/Night** button | Sends an appearance command to the iPhone; app and map support varies. The local simulated dashboard follows it. |
| Local Zinc dashboard and HUD | **Tableau de bord** in the player, implemented in `VehicleDashboard.tsx` and `HudPanel.tsx` | Four live local compositions with projected map, simulated gauges and controls. These do not replace the iPhone's theme package. |
| iPhone CarPlay wallpaper | iPhone CarPlay Settings | Standard CarPlay wallpaper is selected on the phone, not by a Zinc theme file. |
| Experimental Ultra catalog profile | `ZINC_CARPLAY_ULTRA_THEME=44C9FA31EC:985` with cluster and UI Sync enabled | Advertises the catalog asset. The receiver does not force its fixed test layout by default. |

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

## Four local themes you can try

Start the receiver and the player as usual, open **Tableau de bord**, then choose **Halo cyan**, **Strates**, **Bronze** or **Topographie**. The latter is the default and uses a dark contour background and orange instruments inspired by the layout in the supplied Apple screenshots. These are original Zinc drawings, not copied Apple artwork. **Day/Night** changes the local background as well as sending the appearance command to the phone.

The player receives UI Sync layout and palette choices. A live phone selection with palette `orange` selects **Topographie** automatically; recognized `blue` or `cyan` palettes select **Halo cyan**. Other palette/layout identifiers remain visible beside the dashboard heading, and the local style can be picked manually. The receiver no longer sends its fixed `Cobranded/custom` layout request by default, because that request could replace the iPhone's selected theme. Set `ZINC_CARPLAY_ULTRA_FORCE_LAYOUT=1` on the receiver only when testing that old forced layout. In the first live reconnect after this change, the phone opened UI Sync but sent no new layout choice; its CarPlay home wallpaper was plain. Reselect the theme on the iPhone to test propagation. This is still an approximate visualization: the player does not decode the catalog's Core Animation assets, compose its wallpapers, or reproduce its instrument geometry pixel for pixel. In an earlier session the phone sent layout `1B0484EC-1933-524D-80F8-2FC1FC7B4B2D` and palette `orange`.

The **Voiture**, **Radio** and **Climat** tabs under the local cluster are an interactive vehicle simulator. Voiture changes stopped/city/motorway presets and four matching simulated tire pressures. RPM, fuel and tire pressure are sent when Ultra Vehicle State is active and the iPhone subscribes; speed and gear remain local. The receiver also advertises fuel range and odometer values. Radio selects three simulated DAB stations; there is no RF tuner or audio program behind them. The experimental Vehicle State profile advertises a DAB media source, station list, Now Playing metadata and radio controls; Zinc station changes reach the receiver, and phone tune/play/pause/next/previous commands can update its simulated state. A live WebSocket probe confirmed Mac → Pi selection of FIP and the returned state, but the iPhone Radio app has not yet been visually verified. Climat changes power, driver target temperature and fan level. The receiver now describes driver and passenger zones, current and target temperatures, fan, recirculation, automatic climate, sync and front seat heating; supported phone writes update the simulated state. The phone's own Voiture and Climat screens still need a live visual and command test. These descriptors do not provide vehicle hardware or authenticated theme rendering.

## Visual directions

| Theme | Visual direction | Suggested layout | Best use |
| --- | --- | --- | --- |
| **Halo cyan** | Dark teal, cyan circular instruments | Two gauges around the projected cluster map | Cool instrument style |
| **Strates** | Near-black, rose instruments | Two gauges around the projected cluster map | High contrast variation |
| **Bronze** | Warm dark brown, amber instruments | Two gauges around the projected cluster map | Warm instrument style |
| **Topographie** | Dark green contours, orange instruments | Two gauges around the projected cluster map | Approximation of the phone's orange selection |

These are the four working player compositions. The player does not change the iPhone's built-in CarPlay icons, Voiture/Radio/Climat apps, or the phone's cluster renderer. The latter apps need their corresponding vehicle and radio services; their current presence in the app grid does not mean those services are implemented.

## CarPlay Ultra package boundary

Apple describes CarPlay Ultra as an automaker-integrated experience with multiple displays, customizable instrument clusters and vehicle controls. The catalog asset inspected for this experiment contains `Center_Display` and `Cluster_Display`, layout identifiers, palettes, wallpapers, zones and Core Animation assets. Its Cobranded cluster layout offers only `dynamicColor`: black at night and `#f2f2f2` by day. Other catalog layouts contain gradient, landscape or topography wallpapers, but Zinc does not currently compose their assets. An asset ID, matching geometry and accepted UI Sync messages do not establish that an arbitrary package can be authored and installed through this receiver. The package signature chain has not been independently verified.

Sources: [Apple CarPlay Ultra announcement](https://www.apple.com/newsroom/2025/05/carplay-ultra-the-next-generation-of-carplay-begins-rolling-out-today/), [Apple WWDC24 CarPlay design session](https://developer.apple.com/videos/play/wwdc2024/10112/), [Apple CarPlay developer overview](https://developer.apple.com/carplay/), [Apple CarPlay wallpaper help](https://support.apple.com/en-hk/guide/iphone/iph6ade13329/26/ios/26), and the [local Ultra feasibility report](../reports/zinc-next-carplay-ultra-feasibility.md).

## Receiver and paired devices in the player

Open **Appareils** in the Mac player. While it is visible, the authenticated receiver connection refreshes server status every second and pairing details every five seconds. It shows CarPlay session, iAP2, GPS subscription, cluster/theme flags, uptime, the iPhone name and model identifier, and the `deviceID` and `macAddress` values received in AirPlay SETUP. These are displayed as Bluetooth/device ID and Wi-Fi MAC respectively; a private or rotating Wi-Fi address may change across connections. The AirPlay pairing ID comes from the verified controller identity and may differ from both addresses. Known iPhone 17 family identifiers are shown with a readable name using the [AppleDB device list](https://appledb.dev/device-selection/iPhone); unknown models retain the identifier received from AirPlay. Battery percentage comes from an iAP2 `PowerUpdate` (0xAE01) only when the phone supplies a valid 0–100 value; otherwise the panel says **non reçue**.

Each paired row shows its exact identifier and whether BlueZ or AirPlay stores it. On the Pi, BlueZ can also supply name, connected, trusted, bonded and blocked state. An AirPlay row shows a short SHA-256 fingerprint of its saved public key, never the key itself. If a paired identifier matches the active phone's `deviceID` or verified AirPlay controller ID, the row displays its live name; an offline AirPlay record has no saved friendly name. Click **Désappairer**, then **Confirmer** on one exact identifier. The receiver pauses automatic wireless invitations and closes its current session before deleting that Bluetooth or AirPlay record. **Relancer la connexion** resumes invitations. On macOS, the server cannot inspect Linux BlueZ pairings, so the panel reports AirPlay records only. The receiver token protects these WebSocket commands; keep the token private.

The [Linux pairing CLI](../../plugins/carplay/backend/linux/pairings) remains available when the receiver is stopped. It can list and remove exact records independently of the player. If the Bluetooth and AirPlay IDs differ, remove each one you intend to forget. Pairing removal cannot revoke a trust record retained on the iPhone; use iPhone CarPlay and Bluetooth settings to clear that side when needed.
