// Floating card listing every choice of the open setting; picking one applies it and closes the card.
import { For } from 'zinc:ui/solid';
import { Button, heading, captionText } from 'zinc:ui/kit';
import { Setting, settings, openMenu, setOpenMenu } from '../state';
import { apply } from '../session';

/** The open setting as a list of 0 or 1 item. */
function openSetting(): Setting[] {
  const i = openMenu();
  return i >= 0 && i < settings().length ? [settings()[i]] : [];
}

function Choices(props: { setting: Setting }): i32 {
  const s = props.setting;
  return <View class="flex-col absolute top-16 right-84 w-96 p-4 gap-3 rounded-xl bg-white border border-zinc-200 shadow-lg">
    <View class="flex-col gap-1">
      <Text class={heading(4)}>{s.widget.label}</Text>
      <Text class={captionText()}>{s.widget.choices.length} choices</Text>
    </View>
    <View class="flex-row flex-wrap gap-1.5">
      {s.widget.choices.map((choice: string) =>
        <Button label={choice} size="sm" variant={choice === s.value() ? 'default' : 'outline'}
          onClick={() => { setOpenMenu(-1); apply(s, choice); }} />)}
    </View>
  </View>;
}

export function ChoicesPopover(): i32 {
  // a keyed <For> over 0 or 1 setting: opening another setting replaces the card, re-rendering the same one keeps it
  return <For each={openSetting()}>{(s: Setting, _i: i32) => <Choices setting={s} />}</For>;
}
