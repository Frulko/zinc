// PocketJS Hero (examples/pocket-hero) driven headlessly: 5 presses, then the layout tree.
import Hero from "../../examples/pocket-hero/app.tsx";
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
let n = 0;
render(() => <Hero presentationHz={60} />, 0xf8fafc, (dt: number) => {
  n++;
  if (n >= 2 && n <= 6) ui.click(ui.find('Press Circle'));
  if (n === 8) { console.log(ui.dump()); quit(); }
});
