import * as ui from 'zinc:ui';
import { width } from 'zinc:gfx';
import { env } from 'zinc:sys';
import { createSignal, onCleanup } from 'zinc:ui/solid';
import { Button, SearchField, Switch, Sheet, Separator, theme, setTheme, LIGHT, DARK } from 'zinc:ui/kit';
import { createMailbox } from './state';
import { folders } from './data';
import { Folders } from './components/Folders';
import { MessageList } from './components/MessageList';
import { Reader } from './components/Reader';
import { Composer } from './components/Composer';
enum Overlay { Closed, Folders, Reader, Compose }
export function App(): i32 {
  const model = createMailbox();
  const [viewport, setViewport] = createSignal(width());
  const [overlay, setOverlay] = createSignal<Overlay>(Overlay.Closed);
  const [dark, setDark] = createSignal(env('MAIL_DARK') === '1');
  setTheme(dark() ? DARK : LIGHT);
  const transition = (next: Overlay): void => {
    if (next !== Overlay.Closed && overlay() !== Overlay.Closed) return;
    setOverlay(next);
  };
  const close = (): void => transition(Overlay.Closed);
  const openReader = (): void => { if (viewport() < 700) transition(Overlay.Reader); };
  const compose = (reply: boolean): void => { model.compose(reply); close(); transition(Overlay.Compose); };
  const resize = (): void => {
    if (width() === viewport()) return;
    setViewport(width());
    if ((viewport() >= 1000 && overlay() === Overlay.Folders) || (viewport() >= 700 && overlay() === Overlay.Reader)) close();
  };
  ui.addWatcher(resize); onCleanup(() => ui.removeWatcher(resize));
  return <View className={`flex-row w-full h-full bg-${theme().background} text-${theme().foreground}`}>
    <Show when={viewport() >= 1000}><View className={`w-[220px] shrink-0 flex-col p-3 border-r border-${theme().border}`}><Folders model={model} onNavigate={close} /></View></Show>
    <View className={`flex-col shrink-0 bg-${theme().card} ${viewport() >= 700 ? 'w-[340px]' : 'w-full'}`}>
      <View className="p-4 flex-col gap-4 shrink-0">
        <View className="flex-row gap-2 items-center"><Show when={viewport() < 1000}><Button label="Folders" variant="outline" size="sm" onClick={() => transition(Overlay.Folders)} /></Show><Text className={`grow text-[17px] font-medium text-${theme().foreground}`}>{folders[model.folder()]}</Text><Button label="Compose" size="sm" onClick={() => compose(false)} /></View>
        <SearchField label="Search mail" placeholder="Search this folder…" value={model.query} onInput={model.setQuery} />
        <View className="flex-row items-center gap-3"><Text className={`grow text-[12px] text-${theme().mutedForeground}`}>{String(model.visible().length) + ' messages'}</Text><Switch label="Dark" checked={dark} onChange={(value: boolean) => { setDark(value); setTheme(value ? DARK : LIGHT); }} /></View>
      </View>
      <Separator /><MessageList model={model} onOpen={openReader} />
      <View className={`px-4 py-3 border-t border-${theme().border}`}><Text role="status" className={`text-[11px] text-${theme().mutedForeground}`}>{model.notice()}</Text></View>
    </View>
    <Show when={viewport() >= 700}><ScrollView className={`grow min-w-0 p-6 bg-${theme().card} border-l border-${theme().border}`}><Reader model={model} compact={false} onBack={close} onReply={() => compose(true)} /></ScrollView></Show>
    <Sheet title="Mail folders" side="left" size={Math.min(320, viewport())} open={() => overlay() === Overlay.Folders} onOpenChange={(open: boolean) => { if (!open) close(); }}><Folders model={model} onNavigate={close} /></Sheet>
    <Sheet title="Message" size={viewport()} open={() => overlay() === Overlay.Reader} onOpenChange={(open: boolean) => { if (!open) close(); }}><Reader model={model} compact={true} onBack={close} onReply={() => compose(true)} /></Sheet>
    <Composer model={model} width={Math.min(560, viewport() - 32)} open={() => overlay() === Overlay.Compose} onClose={close} onSaved={() => { close(); openReader(); }} />
  </View>;
}
