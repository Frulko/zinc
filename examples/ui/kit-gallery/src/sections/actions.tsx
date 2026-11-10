import { env } from 'zinc:sys';
import { createSignal } from 'zinc:ui/solid';
import { Button, IconButton, ButtonGroup, SplitButton, ToggleGroup, SegmentedControl, CopyButton, HoldToConfirm, CommandPalette, DropdownMenu, ContextMenu, theme, heading } from 'zinc:ui/kit';
const [view, setView] = createSignal('week');
const [formats, setFormats] = createSignal<string[]>(['bold']);
const [palette, setPalette] = createSignal(env('GALLERY') === 'palette');
const [message, setMessage] = createSignal('Ready to edit');

export function ActionsSection(): i32 {
  const menus = [{ label: 'Save a copy', onSelect: () => setMessage('Saved a copy') }, { label: 'Export PDF', onSelect: () => setMessage('Exported PDF') }];
  return <View className="flex-col gap-6">
    <Text className={heading(2)}>Actions</Text>
    <View className="flex-row flex-wrap gap-2 items-center">
      <Button label="Save document" onClick={() => setMessage('Document saved')} />
      <Button label="Secondary" variant="secondary" /><Button label="Outline" variant="outline" />
      <Button label="Ghost" variant="ghost" /><Button label="Delete" variant="destructive" /><Button label="Open help" variant="link" />
      <Button label="Saving document" loading={true} /><Button label="Unavailable" disabled={true} />
    </View>
    <View className="flex-row flex-wrap items-center gap-4">
      <ButtonGroup label="History"><IconButton icon="undo" label="Undo edit" /><IconButton icon="redo" label="Redo edit" /></ButtonGroup>
      <SplitButton label="Publish document" onClick={() => setMessage('Document published')} items={menus} />
      <CopyButton text={() => 'https://zinc.dev/document/quiet'} />
      <HoldToConfirm label="Hold to archive" onConfirm={() => setMessage('Document archived')} />
    </View>
    <View className="flex-row flex-wrap items-center gap-4">
      <ToggleGroup label="Text style" multiple={true} value={formats} onChange={setFormats} items={[{ value: 'bold', label: 'Bold' }, { value: 'italic', label: 'Italic' }, { value: 'underline', label: 'Underline' }]} />
      <SegmentedControl label="Calendar view" value={view} onChange={setView} items={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
    </View>
    <View className="flex-row flex-wrap items-center gap-4">
      <DropdownMenu label="Document actions" items={menus} />
      <Button label="Run a command" variant="outline" onClick={() => setPalette(true)} />
      <ContextMenu items={[{ id: 'rename', label: 'Rename document', onSelect: () => setMessage('Rename selected') }]}><Text className={`text-[13px] text-${theme().mutedForeground}`}>Right click here for document actions</Text></ContextMenu>
    </View>
    <Text role="status" className={`text-[13px] text-${theme().mutedForeground}`}>{message()} · {view()} view</Text>
    <CommandPalette open={palette} onOpenChange={setPalette} items={[{ label: 'Save document', shortcut: 'mod-s', keywords: 'write', onSelect: () => setMessage('Document saved') }, { label: 'Export PDF', keywords: 'print share', onSelect: () => setMessage('Exported PDF') }]} />
  </View>;
}
