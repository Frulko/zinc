// The overlays of zinc:ui/nuxt (ZN-357.03): Modal, Slideover, DropdownMenu, Tooltip and toasts. NUXT_OPEN=modal|slideover|menu|tooltip|toast opens one
// at start (screenshots).
import * as ui from 'zinc:ui';
import { createSignal, createNodeRef } from 'zinc:ui/solid';
import { theme, hex, Button, Card, Input, Modal, Slideover, DropdownMenu, Tooltip, showTooltip, addToast } from 'zinc:ui/nuxt';

export const [modal, setModal] = createSignal<boolean>(false);
export const [drawer, setDrawer] = createSignal<boolean>(false);
export const [chosen, setChosen] = createSignal<string>('-');
export const [compact, setCompact] = createSignal<boolean>(false);
export const menuRef = createNodeRef(), tipRef = createNodeRef();

export function Overlays(): i32 {
  return <Card title="Overlays" description="Modal, Slideover, DropdownMenu, Tooltip, toasts.">
    <View class="flex-row gap-2 flex-wrap items-start">
      <Button label="Open modal" onClick={() => setModal(true)} />
      <Button label="Open slideover" icon="panel-right" color="neutral" variant="outline" onClick={() => setDrawer(true)} />
      <View ref={menuRef} class="flex-col"><DropdownMenu label="Actions" items={[
        [{ label: 'My account', type: 'label' }, { label: 'Edit', icon: 'pencil', kbds: ['E'], onSelect: () => setChosen('edit') }, { label: 'Duplicate', icon: 'copy', onSelect: () => setChosen('duplicate') }],
        [{ label: 'Compact', type: 'checkbox', checked: compact, onSelect: () => setCompact(!compact()) }],
        [{ label: 'Delete', icon: 'trash-2', color: 'error', onSelect: () => setChosen('delete') }]]} /></View>
      <View ref={tipRef} class="flex-col"><Tooltip text="Copy to clipboard" kbds={['⌘', 'C']}><Button icon="copy" color="neutral" variant="ghost" /></Tooltip></View>
      <Button label="Toast" color="success" variant="soft" icon="circle-check" onClick={() => addToast({ title: 'Saved', description: 'Your changes are stored.', icon: 'circle-check', color: 'success', actions: ['Undo'] })} />
    </View>
    <Text class={`text-sm text-${hex(theme().textMuted)}`}>{`menu choice: ${chosen()} · compact ${compact()}`}</Text>
    <Modal open={modal} onUpdate={setModal} title="Invite a member" description="They will get an email with a link." footer={() => <View class="flex-row gap-1.5">
      <Button label="Cancel" color="neutral" variant="outline" onClick={() => setModal(false)} /><Button label="Send invite" onClick={() => setModal(false)} />
    </View>}>
      <Input placeholder="name@example.com" icon="mail" />
    </Modal>
    <Slideover open={drawer} onUpdate={setDrawer} title="Notifications" description="The last ones.">
      <Text class={`text-sm text-${hex(theme().text)}`}>Ada commented on your pull request.</Text>
      <Text class={`text-sm text-${hex(theme().text)}`}>Grace merged “compiler: COBOL”.</Text>
    </Slideover>
  </Card>;
}

/** NUXT_OPEN: the overlay to show at start. */
export function openAtStart(what: string): void {
  if (what === 'modal') setModal(true);
  if (what === 'slideover') setDrawer(true);
  if (what === 'menu') { const h = ui.find('Actions'); if (h >= 0) ui.click(h); }
  if (what === 'tooltip') showTooltip(ui.inspectNode(tipRef.node) !== null ? (ui.inspectNode(tipRef.node) as ui.UiNode).children[0] : -1, true);
  if (what === 'toast') addToast({ title: 'Saved', description: 'Your changes are stored.', icon: 'circle-check', color: 'success', actions: ['Undo'] });
}
