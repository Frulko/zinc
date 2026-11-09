// Overlays: a tooltip with a shortcut hint, a dropdown menu bound to actions, a popover, a dialog and toasts. They open
// above the scrolling page (engine layers), follow their buttons, and close with Escape or a press outside.
import * as ui from 'zinc:ui';
import { env } from 'zinc:sys';
import { createSignal, createNodeRef, onMount } from 'zinc:ui/solid';
import { Button, Card, CardHeader, CardContent, Tooltip, DropdownMenu, Popover, Dialog, Switch, Sheet, HoverCard, ConfirmPopover, GuidedTour, toast, mutedText } from 'zinc:ui/kit';
import { confirming, setConfirming, notifications, setNotifications } from '../state';

// Keymap: ⌘S / Ctrl+S saves, ⌘D duplicates, ⌫ with Cmd deletes; the menu and the tooltip show these shortcuts.
ui.bindKeys('mod-s', 'save');
ui.bindKeys('mod-d', 'duplicate');
ui.bindKeys('mod-backspace', 'delete');
ui.onAction(-1, 'save', () => toast('Saved', 'All changes are on disk.'));
ui.onAction(-1, 'duplicate', () => toast('Duplicated', 'A copy was added to the list.'));
ui.onAction(-1, 'delete', () => setConfirming(true));

function previewTarget(h: i32, text: string): i32 {
  const n = ui.inspectNode(h);
  if (n === null) return -1;
  if (n.tag === ui.BUTTON && n.label === text) return h;
  if (n.tag === ui.TEXT && n.text === text) {
    for (let p = n.parent; p >= 0; p = ui.parentOf(p)) { const parent = ui.inspectNode(p); if (parent !== null && parent.tag === ui.BUTTON) return p; }
  }
  for (const child of n.children) { const found = previewTarget(child, text); if (found >= 0) return found; }
  return -1;
}

export function OverlaysCard(): i32 {
  const [sheet, setSheet] = createSignal(env('OVERLAY') === 'sheet');
  const [tour, setTour] = createSignal(env('OVERLAY') === 'tour');
  const [step, setStep] = createSignal<i32>(0);
  const target = createNodeRef();
  const root = createNodeRef();
  onMount(() => {
    const mode = env('OVERLAY');
    if (mode === 'toast') { toast('Changes saved', 'The workshop is up to date.', -1); toast('Connection lost', 'Reconnect when your network is available.', -1, { tone: 'warning', action: 'Retry' }); return; }
    const label = mode === 'popover' ? 'Notifications' : mode === 'hover' ? 'Project owner' : mode === 'confirm' ? 'Archive project' : mode === 'hint' ? 'Save' : '';
    if (label.length === 0) return;
    const control = previewTarget(root.node, label);
    if (control < 0) return;
    if (mode === 'hint') { const box = ui.screenBox(control); ui.pointerAt(box[0] + 4, box[1] + 4, false); ui.tick(550); }
    else ui.click(control);
  });
  if (env('OVERLAY') === 'dialog') setConfirming(true);
  return <Card className="w-[760px] max-w-full">
    <CardHeader title="Overlays" description="Hints, anchored cards, confirmations and modal surfaces. Escape returns to your work." />
    <CardContent>
      <View ref={root} className="flex-row flex-wrap gap-2">
        <Tooltip label="Save changes" action="save"><Button label="Save" onClick={() => ui.dispatchAction('save')} /></Tooltip>
        <DropdownMenu label="Actions" items={[
          { label: 'Save', action: 'save' },
          { label: 'Duplicate', action: 'duplicate' },
          { label: 'Archive', disabled: true },
          { label: 'Delete…', action: 'delete' },
        ]} />
        <Popover label="Notifications">
          <Text className={mutedText()}>Choose what reaches you.</Text>
          <Switch checked={notifications} onChange={setNotifications} label="Push notifications" />
        </Popover>
        <View ref={target}><Button label="Open dialog" variant="outline" onClick={() => setConfirming(true)} /></View>
        <Button label="Open sheet" variant="outline" onClick={() => setSheet(true)} />
        <HoverCard label="Project owner" trigger={() => <Text className={mutedText()}>Ada Lovelace</Text>}>
          <Text className={mutedText()}>Ada maintains the workshop project.</Text>
          <Button label="View profile" variant="outline" onClick={() => toast('Profile opened')} />
        </HoverCard>
        <ConfirmPopover label="Archive project" title="Archive Workshop?" description="You can restore it from the archive." confirmLabel="Archive" onConfirm={() => toast('Project archived')} />
        <Button label="Start tour" variant="outline" onClick={() => { setStep(0); setTour(true); }} />
        <Button label="Persistent notice" variant="outline" onClick={() => toast('Connection lost', 'Reconnect when your network is available.', -1, { tone: 'warning', action: 'Retry', onAction: () => toast('Reconnecting') })} />
        <Button label="Toast" variant="secondary" onClick={() => toast('Hello', 'Toasts stack in the corner and go away.')} />
      </View>
    </CardContent>
    <Sheet open={sheet} onOpenChange={setSheet} title="Activity" description="Updates from the workshop." side="right" size={380}>
      <Text className={mutedText()}>Ada published a new revision.</Text>
      <Text className={mutedText()}>Your local changes are saved.</Text>
    </Sheet>
    <GuidedTour open={tour} onOpenChange={setTour} step={step} onStepChange={setStep} steps={[
      { title: 'Project details', body: 'Open the dialog to review the project. The target remains interactive.', target: () => target.node, placement: 'bottom' },
      { title: 'Ready to work', body: 'Use Tab to move and Escape to return to the page.' },
    ]} />
    <Dialog open={confirming} onOpenChange={setConfirming} title="Delete the project?"
      description="This removes the project and its files. It cannot be undone."
      footer={() => <View className="flex-row gap-2">
        <Button label="Cancel" variant="outline" onClick={() => setConfirming(false)} />
        <Button label="Delete" variant="destructive" onClick={() => { setConfirming(false); toast('Deleted', 'The project is gone.'); }} />
      </View>} />
  </Card>;
}
