/** @jsxHelpers zinc:ui/kit/host */
import { render } from 'zinc:ui/solid';
import { renderSlot } from 'zinc:ui/kit/host';
import * as ui from 'zinc:ui';
function App(): i32 {
  return (
    <View>
      {[0, 1].map((row: i32) => (
        <View>
          {[0, 1].map((col: i32) =>
            renderSlot(() => {
              const text = 'cell ' + row + ',' + col;
              return (
                <Button aria-label={text}>
                  <Text>{text}</Text>
                </Button>
              );
            }),
          )}
        </View>
      ))}
    </View>
  );
}
function dump(h: i32): void {
  const n = ui.inspectNode(h);
  if (n === null) return;
  if (n.label !== '') console.log(n.label);
  for (const c of n.children) dump(c);
}
let once = false;
render(App, 0xffffff, (dt: number) => {
  if (!once) {
    once = true;
    ui.setAfterPaint(() => {
      dump(ui.rootNode());
      ui.setAfterPaint(null);
    });
  }
});
