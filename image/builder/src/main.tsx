// Mount the native image-building workspace.
import { render } from 'zinc:ui/solid';
import { setColorMode } from 'zinc:ui/nuxt';
import { Workspace } from './pages/workspace';

setColorMode('light');
render(Workspace, 0xf5f6f0, null);
