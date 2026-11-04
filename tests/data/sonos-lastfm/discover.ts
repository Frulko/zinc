// Manual read-only LAN smoke check; never starts playback or submits a scrobble.
import { discover } from 'zinc:sonos';
import * as sys from 'zinc:sys';
async function main(): Promise<void> {
  const house = await discover(sys.env('SONOS_ADDRESS'), 3000);
  console.log('Sonos plugin: ' + house.speakers.length.toString() + ' rooms, ' + house.groups.length.toString() + ' groups; seed ' + house.seed);
  for (const g of house.groups) {
    await house.update(g);
    console.log('Playback read: ' + g.state + '; duration ' + g.track.duration.toString() + '; track metadata ' + (g.track.artist !== '' && g.track.title !== '' ? 'available' : 'absent'));
  }
}
main().catch((e: Error) => { console.error(e.message); sys.exit(1); });
