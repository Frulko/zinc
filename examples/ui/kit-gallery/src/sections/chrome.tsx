import { createSignal } from 'zinc:ui/solid';
import * as storage from 'zinc:storage';
import { MenuBar, Button, theme, heading } from 'zinc:ui/kit';
import { Toolbar, StatusBar, StatusItem, DocumentTabs, DocumentTab, DockLayout, DockLayoutState, saveDockLayout, parseDockLayout, setDockPanelOpen } from 'zinc:ui/kit';

const [documents, setDocuments] = createSignal<DocumentTab[]>([{ id: 'notes', label: 'Field notes', dirty: true }, { id: 'readme', label: 'README.md' }, { id: 'setup', label: 'Setup guide', closable: false }]);
const [selected, setSelected] = createSignal('notes');
const [status, setStatus] = createSignal('Field notes has unsaved changes');
const [layout, setLayout] = createSignal<DockLayoutState>({
  root: { id: 'workspace', axis: 'horizontal', ratio: 0.28, tabs: [], selected: '',
    first: { id: 'files', axis: 'tabs', ratio: 0.5, tabs: ['explorer'], selected: 'explorer' },
    second: { id: 'editor', axis: 'vertical', ratio: 0.72, tabs: [], selected: '',
      first: { id: 'document', axis: 'tabs', ratio: 0.5, tabs: ['preview', 'source'], selected: 'preview' },
      second: { id: 'output', axis: 'tabs', ratio: 0.5, tabs: ['console'], selected: 'console' } } },
  closed: []
});
function saveLayout(): void {
  try { storage.set('kit-gallery-layout', saveDockLayout(layout())); setStatus('Workspace layout saved'); }
  catch (e) { setStatus('Could not save layout: ' + e.message); }
}
function restoreLayout(): void {
  try { setLayout(parseDockLayout(storage.get('kit-gallery-layout'))); setStatus('Workspace layout restored'); }
  catch (e) { setStatus('Layout unchanged: ' + e.message); }
}

export function ChromeSection(): i32 {
  const ink = `text-[13px] text-${theme().foreground}`;
  return <View className="flex-col gap-4">
    <Text className={heading(2)}>App chrome</Text>
    <Text className={`text-[13px] text-${theme().mutedForeground}`}>F10 opens the menu bar. Drag tabs to dock; panel actions offer the same moves from the keyboard.</Text>
    <View className={`flex-col border border-${theme().border} rounded-[18px] bg-${theme().card} overflow-hidden h-[520px]`}>
      <MenuBar items={[
        { label: 'File', mnemonic: 'f', submenu: [{ id: 'save', label: 'Save layout', accelerator: 'mod-s', onSelect: saveLayout }, { label: 'Restore layout', onSelect: restoreLayout }] },
        { label: 'View', mnemonic: 'v', submenu: [{ label: 'Reopen output', onSelect: () => setLayout(setDockPanelOpen(layout(), 'console', true)) }, { label: 'Word wrap', checked: true }] }
      ]} />
      <Toolbar label="Workspace actions" items={[
        { label: 'Save layout', icon: 'save', onSelect: saveLayout },
        { label: 'Restore layout', icon: 'rotate-ccw', onSelect: restoreLayout },
        { label: '', separator: true },
        { label: 'Reopen output', onSelect: () => setLayout(setDockPanelOpen(layout(), 'console', true)) },
        { label: 'Preview', checked: true, onSelect: () => setStatus('Preview selected') }
      ]} trailing={() => <Text className={`text-[12px] text-${theme().mutedForeground}`}>Quiet workspace</Text>} />
      <DocumentTabs items={documents} selected={selected} onSelect={setSelected} onClose={(id: string) => {
        const item = documents().find((tab: DocumentTab) => tab.id === id);
        if (item !== undefined && item.dirty === true) { setStatus('Save Field notes before closing it'); return; }
        const remaining = documents().filter((tab: DocumentTab) => tab.id !== id); setDocuments(remaining);
        if (selected() === id && remaining.length > 0) setSelected(remaining[0].id);
      }} onMove={(from: i32, to: i32) => { const next = documents().slice(); const item = next.splice(from, 1)[0]; next.splice(to, 0, item); setDocuments(next); }} />
      <DockLayout layout={layout} onChange={setLayout} panels={[
        { id: 'explorer', label: 'Files', content: () => <View className="flex-col gap-3"><Text className={ink}>Documents</Text><Text className={ink}>  Field notes.md</Text><Text className={ink}>  README.md</Text><Text className={ink}>  Setup guide.md</Text></View> },
        { id: 'preview', label: 'Preview', content: () => <View className="flex-col gap-3"><Text className={heading(4)}>Workshop notes</Text><Text className={ink}>Keep each tool close to the work it helps with.</Text><Text className={`text-[12px] text-${theme().mutedForeground}`}>This panel can share a group or dock along an edge.</Text></View> },
        { id: 'source', label: 'Source', content: () => <Text className={ink}># Workshop notes</Text> },
        { id: 'console', label: 'Output', content: () => <Text className={`text-[12px] tabular-nums text-${theme().mutedForeground}`}>Build completed · 0 errors</Text> }
      ]} />
      <StatusBar trailing={() => <StatusItem label="Ln 8, Col 12 · UTF-8" />}><StatusItem label={status()} /></StatusBar>
    </View>
  </View>;
}
