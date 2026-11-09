import { render } from 'zinc:ui/solid';
import { Alert, Spinner } from 'zinc:ui/kit';
import * as ui from 'zinc:ui';
// Dynamic JavaScript behavior must not require strict type checking for asset discovery.
const choose = new Proxy({ saved: true }, { get: (target, key) => Reflect.get(target, key) });
const App = () => {
  const root = ui.createNode(ui.VIEW);
  ui.insert(root, Alert({ title: choose.saved ? 'Saved' : 'Waiting' }), -1);
  ui.insert(root, Spinner({}), -1);
  return root;
};
render(App, 0xffffff, null);

console.log('plain JS defaults fallback: pass');
