import { render } from 'zinc:ui/solid';
import { Session } from 'zinc:carplay';
import { Iap2Panel, tickIap2 } from '../../../../examples/carplay/src/components/Iap2Panel';
const session = new Session();
session.iap2 = { connected: false, tracing: true, subscriptions: [0x5000, 0x5200], catalog: [
  { id: 0x5000, name: 'StartNowPlayingUpdates', feature: 'Now Playing', direction: 'TX', schema: '0:media GROUP; 1:playback GROUP', samplePayload: '', declared: true, tx: 1, rx: 0, sensitive: false },
  { id: 0x5001, name: 'NowPlayingUpdate', feature: 'Now Playing', direction: 'RX', schema: '0:media GROUP {1:title STRING; 12:artist STRING}', samplePayload: '', declared: true, tx: 0, rx: 155, sensitive: false },
  { id: 0x5201, name: 'RouteGuidanceUpdate', feature: 'Navigation', direction: 'RX', schema: '3:currentRoad STRING; 19:sourceName STRING', samplePayload: '', declared: true, tx: 0, rx: 15, sensitive: false },
  { id: 0x5204, name: 'LaneGuidanceInformation', feature: 'Navigation', direction: 'RX', schema: '2:lane GROUP', samplePayload: '', declared: true, tx: 0, rx: 0, sensitive: false },
  { id: 0x4c06, name: 'PlayMediaLibraryCurrentSelection', feature: 'Media Library', direction: 'TX', schema: '', samplePayload: '', declared: false, tx: 0, rx: 0, sensitive: false },
] };
session.iap2Log.push('TEST FIXTURE · IAP2 TX [wired] 0x5000 StartNowPlayingUpdates\n  [0] media: {\n    [1] title: void\n    [26] artworkTransferId: void\n  }');
session.iap2Log.push('TEST FIXTURE · IAP2 RX [wired] 0x5001 NowPlayingUpdate\n  [0] media: {\n    [1] title: "Titre de test"\n    [12] artist: "Artiste de test"\n  }');
tickIap2(session, 0.25, true);
function App(): i32 { return <View className="h-full bg-slate-950"><Text className="text-amber-200 p-3">TEST FIXTURE · aucun iPhone connecté</Text><Iap2Panel /></View>; }
render(App, 0x020617, (_dt: number) => {});
console.log('iAP2 inspector fixture: ok');
