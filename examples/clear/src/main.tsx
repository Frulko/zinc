import { render } from 'zinc:ui/solid';
import * as window from 'zinc:system/window';
import { ClearApp } from './pages/ClearApp';
import { initialize } from './state';
import { installKeyboard } from './keyboard';
import { BACKGROUND } from './themes';

initialize();
installKeyboard();
render(ClearApp, BACKGROUND, null);
if (window.isSupported()) {
  window.setTitleBar('overlay');
  window.setTrafficLights(13, 16);
}
