import { render } from 'zinc:ui/solid';
import { Session } from 'zinc:carplay';
import { HudPanel, tickHud } from '../../../examples/carplay/src/components/HudPanel';
import { hudDistance, maneuverGlyph } from '../../../examples/carplay/src/services/hud';
function check(ok: boolean): void { if (!ok) throw new Error('HUD formatting regression'); }
check(hudDistance(0, false) === '—');
check(hudDistance(0, true) === '0 m');
check(hudDistance(2500, true) === '2.5 km');
check(maneuverGlyph(1) === '←' && maneuverGlyph(2) === '→' && maneuverGlyph(-1) === '·');
const session = new Session();
session.hud = { active: true, road: 'Avenue de test', instruction: 'Tournez à droite', distance: 350,
  remaining: 4200, maneuver: 2, distanceKnown: true, remainingKnown: true, remainingSeconds: 480,
  destination: 'Destination de test', source: 'Test fixture', routePackets: 14, mediaPackets: 35,
  title: 'Titre de test', artist: 'Artiste de test', album: 'Album de test', mediaApp: 'Music',
  elapsedMs: 97000, durationMs: 210000, playbackStatus: 1, stale: false };
tickHud(session);
function App(): i32 {
  return <View className="h-full bg-slate-950 justify-center gap-4">
    <Text className="text-amber-200 px-5">TEST FIXTURE · not live iPhone data</Text>
    <HudPanel />
  </View>;
}
render(App, 0x020617, (_dt: number) => {});
console.log('HUD formatting: ok');
