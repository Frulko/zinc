// The primitives with no class and no style (docs/ui.md, "What the primitives draw"; ZN-774.18): a View, a Text, a Button, an Input, a
// TextArea and a View that takes clicks. light.tsx and dark.tsx mount it on a light and a dark window; tests/t1/ui_neutral.sh lists what
// the frames draw (tools/scene-texts --cmds): their texts and the caret, no fill and no border, and the keyboard ring on a field Tab reached.
import * as ui from 'zinc:ui';

export function App(): i32 {
  return <View>
    <Text>text</Text>
    <Button onClick={(): void => {}}><Text>button</Text></Button>
    <Input value="input" />
    <TextArea rows={1} value="textarea" />
    <View onClick={(): void => {}}><Text>pressable</Text></View>
  </View>;
}

let frame = 0, input = -1;
/** Frame 2: the Input takes the focus as a click gives it (caret, no ring); frame 6: Tab moves it to the TextArea (caret and the keyboard ring). */
export function script(): void {
  ui.addWatcher((): void => {
    frame++;
    if (input < 0) for (let i = 0; i < 30; i++) { const n = ui.inspectNode(i); if (n !== null && n.ed !== null) { input = i; break; } }
    if (frame === 2 && input >= 0) ui.focusNode(input);
    if (frame === 6) ui.keyDown(-1, 'Tab');
  });
}
