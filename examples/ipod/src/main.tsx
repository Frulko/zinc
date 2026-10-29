// iPod: a read-only viewer of a classic iPod (zinc:ipod). It finds the iPods plugged in, opens one and shows the device (a drawing
// in its colour, how its disk is used, its identity), its albums with their covers, its songs, podcasts, audiobooks and videos, its
// photos, its playlists, its notes, contacts, calendars and recordings, and every detail the iPod and its database give. A double-click
// on a track plays it from the iPod (the bar at the top: play, pause, previous, next, seek), here or on a Sonos group (the output at
// the right of the bar). Albums, playlists, podcasts and chosen
// songs download to the computer; files and folders (picked, or dropped on the window) are added to the iPod; backups are taken,
// restored and deleted; duplicates are found (tags, files, sound) and merged; a queue shows the transfers and a log every operation. Nothing is changed on the iPod until Allow changes
// is turned on. An iPod mounted, unmounted or pulled shows within seconds. This file mounts the app, routes the pages and the
// files dropped on the window; what it does is in state.ts, actions.ts, the services and the pages.
//
//   zinc run examples/ipod
//   IPOD_DEMO_MOUNT=/Volumes/MYPOD zinc run examples/ipod     show only the iPod mounted there
//   IPOD_DEMO_REMOTE=http://pi.local:8686 IPOD_DEMO_REMOTE_TOKEN=T zinc run examples/ipod     connect to that iPod daemon at start
//   IPOD_DEMO_SONOS=192.168.1.20 zinc run examples/ipod     ask that Sonos speaker first for the groups
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import { on } from 'zinc:system';
import { library, page, rescan, closeDevice, loadRemote, openRemoteDevice } from './state';
import { addFiles } from './actions';
import { PodLibrary } from './services/ipod';
import { bg, fg, BACKGROUND, TEXT, CLEAR_COLOR, PAGE_ALBUMS, PAGE_SONGS, PAGE_PODCASTS, PAGE_AUDIOBOOKS, PAGE_VIDEOS, PAGE_PHOTOS, PAGE_PLAYLISTS,
  PAGE_FILES, PAGE_SPECS, PAGE_ADD, PAGE_BACKUPS, PAGE_OPTIMISE, PAGE_TRANSFERS, PAGE_LOGS } from './constants';
import { Sidebar } from './components/Sidebar';
import { NowPlaying } from './components/NowPlaying';
import { OutputMenu } from './components/OutputPicker';
import { pickerOpen } from './services/sonos';
import { Toasts } from './components/Toasts';
import { DevicesPage } from './pages/devices/DevicesPage';
import { OverviewPage } from './pages/overview/OverviewPage';
import { AlbumsPage } from './pages/albums/AlbumsPage';
import { MediaPage } from './pages/media/MediaPage';
import { PhotosPage } from './pages/photos/PhotosPage';
import { FilesPage } from './pages/files/FilesPage';
import { PlaylistsPage } from './pages/playlists/PlaylistsPage';
import { SpecsPage } from './pages/specs/SpecsPage';
import { AddPage } from './pages/add/AddPage';
import { BackupsPage } from './pages/backups/BackupsPage';
import { OptimisePage } from './pages/optimise/OptimisePage';
import { TransfersPage } from './pages/transfers/TransfersPage';
import { LogsPage } from './pages/logs/LogsPage';

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
  if (p === PAGE_ADD) return <AddPage />;
  if (p === PAGE_BACKUPS) return <BackupsPage />;
  if (p === PAGE_OPTIMISE) return <OptimisePage />;
  if (p === PAGE_TRANSFERS) return <TransfersPage />;
  if (p === PAGE_LOGS) return <LogsPage />;
  return <OverviewPage lib={props.lib} />;
}

function App(): i32 {
  return <View className={`flex-row h-full ${bg(BACKGROUND)} ${fg(TEXT)}`}>
    <Sidebar />
    <View className="grow basis-0 flex-col min-w-0 min-h-0">
      {library() !== null ? <NowPlaying /> : <View />}
      {library() !== null ? <Content lib={library() as PodLibrary} page={page()} /> : <DevicesPage />}
      {page() !== PAGE_TRANSFERS || library() === null ? <Toasts /> : <View />}
      {library() !== null && pickerOpen() ? <OutputMenu /> : <View />}
    </View>
  </View>;
}

// close the iPod before the process ends on a signal (the plugin closes it too when the process exits)
async function quit(): Promise<void> {
  try { await closeDevice(); } catch (e) { /* closing a pulled iPod fails: quit anyway */ }
  sys.exit(0);
}
// files dropped on the window arrive one event per file: those of one drop are added together
let dropped: string[] = [];
on('drop', (args: string[]) => {
  if (args.length !== 1 || library() === null) return;   // a text dropped has a second word
  if (dropped.length === 0) setTimeout(() => { const files = dropped; dropped = []; addFiles(files); }, 100);
  dropped.push(args[0]);
});

sys.onSignal('SIGINT', () => { quit(); });
sys.onSignal('SIGTERM', () => { quit(); });

ui.setScheme('auto');
loadRemote();
const remoteAtStart = sys.env('IPOD_DEMO_REMOTE');
if (remoteAtStart !== '') openRemoteDevice(remoteAtStart, sys.env('IPOD_DEMO_REMOTE_TOKEN'));
rescan();
render(App, CLEAR_COLOR, null);
