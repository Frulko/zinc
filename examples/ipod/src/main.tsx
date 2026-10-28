// iPod: a read-only viewer of a classic iPod (zinc:ipod). It finds the iPods plugged in, opens one and shows the device (a drawing
// in its colour, how its disk is used, its identity), its albums with their covers, its songs, its playlists and every detail the
// iPod and its database give. It never writes to the iPod. This file mounts the app and routes the pages; what it does is in
// state.ts, the services and the pages.
//
//   zinc run examples/ipod
//   IPOD_DEMO_MOUNT=/Volumes/MYPOD zinc run examples/ipod     show only the iPod mounted there
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import { library, page, rescan, closeDevice } from './state';
import { PodLibrary } from './services/ipod';
import { bg, fg, BACKGROUND, TEXT, CLEAR_COLOR, PAGE_ALBUMS, PAGE_SONGS, PAGE_PLAYLISTS, PAGE_SPECS } from './constants';
import { Sidebar } from './components/Sidebar';
import { DevicesPage } from './pages/devices/DevicesPage';
import { OverviewPage } from './pages/overview/OverviewPage';
import { AlbumsPage } from './pages/albums/AlbumsPage';
import { SongsPage } from './pages/songs/SongsPage';
import { PlaylistsPage } from './pages/playlists/PlaylistsPage';
import { SpecsPage } from './pages/specs/SpecsPage';

function Content(props: { lib: PodLibrary; page: string }): i32 {
  const p = props.page;
  if (p === PAGE_ALBUMS) return <AlbumsPage />;
  if (p === PAGE_SONGS) return <SongsPage />;
  if (p === PAGE_PLAYLISTS) return <PlaylistsPage />;
  if (p === PAGE_SPECS) return <SpecsPage lib={props.lib} />;
  return <OverviewPage lib={props.lib} />;
}

function App(): i32 {
  return <View className={`flex-row h-full ${bg(BACKGROUND)} ${fg(TEXT)}`}>
    <Sidebar />
    <View className="grow flex-col min-w-0">
      {library() !== null ? <Content lib={library() as PodLibrary} page={page()} /> : <DevicesPage />}
    </View>
  </View>;
}

// close the iPod before the process ends on a signal (the plugin closes it too when the process exits)
async function quit(): Promise<void> {
  try { await closeDevice(); } catch (e) { /* closing a pulled iPod fails: quit anyway */ }
  sys.exit(0);
}
sys.onSignal('SIGINT', () => { quit(); });
sys.onSignal('SIGTERM', () => { quit(); });

ui.setScheme('auto');
rescan();
render(App, CLEAR_COLOR, null);
