// Overlays: a tooltip with a shortcut hint, a dropdown menu bound to actions, a popover, a dialog and toasts. They open
// above the scrolling page (engine layers), follow their buttons, and close with Escape or a press outside.
import * as ui from 'zinc:ui';
import { Button, Card, CardHeader, CardContent, Tooltip, DropdownMenu, Popover, Dialog, Switch, toast, mutedText } from 'zinc:ui/kit';
import { confirming, setConfirming, notifications, setNotifications } from '../state';

// Keymap: ⌘S / Ctrl+S saves, ⌘D duplicates, ⌫ with Cmd deletes; the menu and the tooltip show these shortcuts.
ui.bindKeys('mod-s', 'save');
ui.bindKeys('mod-d', 'duplicate');
ui.bindKeys('mod-backspace', 'delete');
ui.onAction(-1, 'save', () => toast('Saved', 'All changes are on disk.'));
ui.onAction(-1, 'duplicate', () => toast('Duplicated', 'A copy was added to the list.'));
ui.onAction(-1, 'delete', () => setConfirming(true));

export function OverlaysCard(): i32 {
  return <Card class="w-[500px]">
    <CardHeader title="Overlays" description="Tooltip, menu, popover, dialog and toasts. Escape closes the latest one." />
    <CardContent>
      <View class="flex-row flex-wrap gap-2">
        <Tooltip label="Save changes" action="save"><Button label="Save" onClick={() => ui.dispatchAction('save')} /></Tooltip>
        <DropdownMenu label="Actions" items={[
          { label: 'Save', action: 'save' },
          { label: 'Duplicate', action: 'duplicate' },
          { label: 'Archive', disabled: true },
          { label: 'Delete…', action: 'delete' },
        ]} />
        <Popover label="Notifications">
          <Text class={mutedText()}>Choose what reaches you.</Text>
          <Switch checked={notifications} onChange={setNotifications} label="Push notifications" />
        </Popover>
        <Button label="Toast" variant="secondary" onClick={() => toast('Hello', 'Toasts stack in the corner and go away.')} />
      </View>
    </CardContent>
    <Dialog open={confirming} onOpenChange={setConfirming} title="Delete the project?"
      description="This removes the project and its files. It cannot be undone."
      footer={() => <View class="flex-row gap-2">
        <Button label="Cancel" variant="outline" onClick={() => setConfirming(false)} />
        <Button label="Delete" variant="destructive" onClick={() => { setConfirming(false); toast('Deleted', 'The project is gone.'); }} />
      </View>} />
  </Card>;
}
