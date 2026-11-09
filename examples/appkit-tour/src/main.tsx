// appkit-tour: a Finder-like browser, the milestone app of zinc:appkit (docs/reports/appkit-native-ui-research.md §9). With "render": "native"
// on macOS every part is a real AppKit view: the window's toolbar and search field, the sidebar's source list, a table of 10,000 files, the
// inspector's controls, an alert and a sheet; the menu bar is the system's. ZINC_RENDER=drawn, or any other platform, draws the same program.
import 'zinc:appkit';
import { Window, SplitView } from 'zinc:appkit';
import { render } from 'zinc:ui/solid';
import { BrowserToolbar } from './components/BrowserToolbar';
import { PlacesSidebar } from './components/PlacesSidebar';
import { FileTable } from './components/FileTable';
import { Inspector } from './components/Inspector';
import { installMenuBar } from './menus';

function App(): i32 {
  return <Window title="AppKit Tour" toolbarStyle="unified">
    <BrowserToolbar />
    <SplitView className="flex-1">
      <PlacesSidebar />
      <FileTable />
      <Inspector />
    </SplitView>
  </Window>;
}

installMenuBar();
render(App, 0xffffff, null);
