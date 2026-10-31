// zinc:editor's views, headless (tests/t1/editor.sh): a CodeEditor on two lines and a CodeView of a JSON snippet, in Atelier's Light theme.
// Frame 3 puts the caret after `one`, frame 4 adds a cursor below, frame 5 types `(` (it closes itself) and `x` at both, frame 7
// undoes the typed run at every cursor at once, frame 8 redoes it. The program prints the text after each step.
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { EditorState, CodeEditor, CodeView, stepEditor, stepCursors, drawCursors, editCommand, useThemes, LIGHT, DARK, langOf, theme, bg } from 'zinc:editor';

useThemes(LIGHT, DARK, false);
const st = new EditorState('demo.ts', 'one\ntwo', langOf('demo.ts'));

function App(): i32 {
  return <View className={`flex-col h-full p-3 gap-3 ${bg(theme().chrome)}`}>
    <View className="h-[90] rounded-lg overflow-hidden">
      <CodeEditor state={st} visible={() => true} />
      <Canvas className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => drawCursors(st, x, y, w, h)} />
    </View>
    <CodeView code={'{\n  "name": "zinc",\n  "tags": ["editor", 1, true]\n}\n'} lang="json" />
  </View>;
}

let frame = 0;
function tick(dt: number): void {
  frame++;
  stepCursors(st);
  if (frame === 3) { ui.focusNode(st.node()); ui.select(st.node(), 3, 3); }
  else if (frame === 4) editCommand(st, 'cursor-below');
  else if (frame === 5) { ui.typeText(-1, '('); ui.typeText(-1, 'x'); }
  else if (frame === 7) { console.log('text ' + st.text().replaceAll('\n', '|')); editCommand(st, 'undo'); }
  else if (frame === 8) { console.log('undone ' + st.text().replaceAll('\n', '|')); editCommand(st, 'redo'); }
  else if (frame === 9) console.log('redone ' + st.text().replaceAll('\n', '|'));
  stepEditor(st, [], 0, -1);
}
render(App, LIGHT.chrome, tick);
