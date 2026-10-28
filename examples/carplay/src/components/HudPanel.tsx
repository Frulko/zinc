import { createSignal } from 'zinc:ui/solid';
import { HudSnapshot, Session } from 'zinc:carplay';
import { hudDistance, maneuverGlyph } from '../services/hud';
const [data, setData] = createSignal<HudSnapshot | null>(null);
export function tickHud(session: Session): void { setData(session.hud); }
function state(): string {
  const h = data(); return h === null ? 'EN ATTENTE IAP2' : h.stale ? 'DONNÉES ANCIENNES' : h.source !== '' ? 'IAP2 REÇU · ' + h.source : 'IAP2 REÇU';
}
function distance(): string { const h = data(); return h === null || !h.active ? '—' : hudDistance(h.distance, h.distanceKnown); }
function direction(): string { const h = data(); return h === null || !h.active ? '·' : maneuverGlyph(h.maneuver); }
function instruction(): string {
  const h = data(); return h === null || h.routePackets === 0 ? 'En attente de guidage' : !h.active ? 'Aucun itinéraire actif' : h.instruction || 'Instruction non fournie';
}
function road(): string { const h = data(); return h === null || !h.active ? '' : h.road || h.destination || 'Route non fournie'; }
function trip(): string {
  const h = data(); if (h === null || !h.active) return 'Distance et durée non reçues';
  const remaining = hudDistance(h.remaining, h.remainingKnown);
  return h.remainingSeconds === undefined ? `Restant ${remaining}` : `Restant ${remaining} · ${Math.ceil(h.remainingSeconds / 60)} min`;
}
function song(): string { const h = data(); return h === null || h.title === '' ? 'Aucun titre reçu' : h.title; }
function artist(): string { const h = data(); return h === null ? '' : h.artist + (h.album ? ' · ' + h.album : ''); }
function clock(ms: number | undefined): string {
  if (ms === undefined) return '—';
  const s = Math.floor(ms / 1000); const rest = s % 60;
  return `${Math.floor(s / 60)}:${rest < 10 ? '0' : ''}${rest}`;
}
function playback(): string {
  const h = data(); if (h === null) return 'État non reçu';
  const status = h.playbackStatus === 1 ? 'Lecture' : h.playbackStatus === 2 ? 'Pause' : h.playbackStatus === 0 ? 'Arrêt' : h.playbackStatus === 3 ? 'Avance' : h.playbackStatus === 4 ? 'Retour' : 'État non reçu';
  return status + ' · ' + clock(h.elapsedMs) + ' / ' + clock(h.durationMs);
}
function mediaSource(): string { const h = data(); return h !== null && h.mediaApp ? h.mediaApp : 'IPHONE'; }
function counts(): string { const h = data(); return h === null ? '0 navigation · 0 média' : `${h.routePackets} navigation · ${h.mediaPackets} média`; }
export function HudPanel(): i32 {
  return <View className="h-44 bg-slate-900 border-t border-slate-700 px-5 py-3 flex-col gap-2">
    <View className="flex-row items-center gap-3">
      <Text className="text-xs text-cyan-300">HUD / {state()}</Text>
      <View className="grow"></View><Text className="text-xs text-slate-400">{counts()}</Text>
    </View>
    <View className="flex-row grow gap-4">
      <View className="w-28 flex-col justify-center">
        <Text className="text-4xl text-cyan-300">{direction()}</Text>
        <Text className="text-xl text-white font-bold">{distance()}</Text>
      </View>
      <View className="grow flex-col justify-center gap-1">
        <Text className="text-lg text-white font-bold">{instruction()}</Text>
        <Text className="text-sm text-cyan-200">{road()}</Text>
        <Text className="text-xs text-slate-400">{trip()}</Text>
      </View>
      <View className="w-56 border-l border-slate-700 pl-4 flex-col justify-center gap-2">
        <Text className="text-xs text-amber-200">MÉDIA / {mediaSource()}</Text>
        <Text className="text-sm text-white">{song()}</Text>
        <Text className="text-xs text-slate-400">{artist()}</Text>
        <Text className="text-xs text-amber-100">{playback()}</Text>
      </View>
    </View>
  </View>;
}
