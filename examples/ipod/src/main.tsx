// iPod: a read-only viewer of a classic iPod (zinc:ipod). It finds the iPods plugged in, opens one and shows the device (a drawing
// in its colour, how its disk is used, its identity), its albums with their covers, its songs, podcasts, audiobooks and videos, its
// photos, its playlists, its notes, contacts, calendars and recordings, and every detail the iPod and its database give. A double-click
// on a track plays it from the iPod (the bar at the top: play, pause, previous, next, seek). It never writes to the iPod. This file
// mounts the app and routes the pages; what it does is in state.ts, the services and the pages.
//
//   zinc run examples/ipod
//   IPOD_DEMO_MOUNT=/Volumes/MYPOD zinc run examples/ipod     show only the iPod mounted there
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import { library, page, rescan, closeDevice } from './state';
import { PodLibrary } from './services/ipod';
import { bg, fg, BACKGROUND, TEXT, CLEAR_COLOR, PAGE_ALBUMS, PAGE_SONGS, PAGE_PODCASTS, PAGE_AUDIOBOOKS, PAGE_VIDEOS, PAGE_PHOTOS, PAGE_PLAYLISTS,
  PAGE_FILES, PAGE_SPECS } from './constants';
import { Sidebar } from './components/Sidebar';
import { NowPlaying } from './components/NowPlaying';
import { DevicesPage } from './pages/devices/DevicesPage';
import { OverviewPage } from './pages/overview/OverviewPage';
import { AlbumsPage } from './pages/albums/AlbumsPage';
import { MediaPage } from './pages/media/MediaPage';
import { PhotosPage } from './pages/photos/PhotosPage';
import { FilesPage } from './pages/files/FilesPage';
import { PlaylistsPage } from './pages/playlists/PlaylistsPage';
import { SpecsPage } from './pages/specs/SpecsPage';

function Content(props: { lib: PodLibrary; page: string }): i32 {
  const p = props.page;
  if (p === PAGE_ALBUMS) return <AlbumsPage />;
  if (p === PAGE_SONGS) return <MediaPage title="Songs" one="song" many="songs" />;
  if (p === PAGE_PODCASTS) return <MediaPage title="Podcasts" one="episode" many="episodes" />;
  if (p === PAGE_AUDIOBOOKS) return <MediaPage title="Audiobooks" one="audiobook" many="audiobooks" />;
  if (p === PAGE_VIDEOS) return <MediaPage title="Videos" one="video" many="videos" />;
  if (p === PAGE_PHOTOS) return <PhotosPage />;
  if (p === PAGE_FILES) return <FilesPage />;
  if (p === PAGE_PLAYLISTS) return <PlaylistsPage />;
  if (p === PAGE_SPECS) return <SpecsPage lib={props.lib} />;
  return <OverviewPage lib={props.lib} />;
}

function App(): i32 {
  return <View className={`flex-row h-full ${bg(BACKGROUND)} ${fg(TEXT)}`}>
    <Sidebar />
    <View className="grow flex-col min-w-0">
      {library() !== null ? <NowPlaying /> : <View />}
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
