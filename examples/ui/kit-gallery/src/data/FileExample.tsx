import { createSignal } from 'zinc:ui/solid';
import { env } from 'zinc:sys';
import { FileBrowser, OpenFileDialog, SaveFileDialog, FileEntry, Button, heading, theme } from 'zinc:ui/kit';
const [folder, setFolder] = createSignal('.'), [selected, setSelected] = createSignal<string[]>([]);
const [open, setOpen] = createSignal(env('GALLERY_DIALOG') === 'open'), [save, setSave] = createSignal(env('GALLERY_DIALOG') === 'save'), [result, setResult] = createSignal('');
const filters = [{ label: 'All files', patterns: ['*'] }, { label: 'Markdown', patterns: ['*.md'] }, { label: 'Zinc and JSON', patterns: ['*.ts', '*.tsx', '*.json'] }];
export function FileExample(): i32 {
  return <View className="flex-col gap-3">
    <Text className={heading(3)}>Files on this device</Text>
    <FileBrowser path={folder} onNavigate={setFolder} selected={selected} onSelect={setSelected} multiple={true} height={240} places={[{ label: 'Gallery', path: '.' }, { label: 'Standard library', path: '../../../lib/std' }]} onActivate={(entry: FileEntry) => setResult('Selected ' + entry.path)} />
    <View className="flex-row gap-2"><Button label="Open file…" variant="outline" onClick={() => setOpen(true)} /><Button label="Save file…" variant="outline" onClick={() => setSave(true)} /></View>
    <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{result() === '' ? 'The dialogs choose a path; this gallery never writes a file.' : result()}</Text>
    <OpenFileDialog open={open} onOpenChange={setOpen} initialFolder="." filters={filters} multiple={true} onConfirm={(paths: string[]) => setResult('Open: ' + paths.join(', '))} />
    <SaveFileDialog open={save} onOpenChange={setSave} initialFolder="." initialName="field-notes.md" filters={filters} onConfirm={(paths: string[]) => setResult('Save path: ' + paths.join(', '))} />
  </View>;
}
