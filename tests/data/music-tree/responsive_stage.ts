// Real demo nodes, fixed data and inert speakers: never contacts a Sonos or a relay.
import { onFrame, width, height } from 'zinc:gfx';
import { env } from 'zinc:sys';
import { Stage, DisplayObject, takeTouchZones, restoreTouchZones } from 'zinc:stage';
import { System, Group, Speaker } from 'zinc:sonos';
import { Item, Found, Spotify } from 'zinc:spotify';
import { appState } from '@APP@/src/state';
import { isCompactScreen } from '@APP@/src/core/responsive';
import { PlayerSlideNode } from '@APP@/src/pages/home/player-slide';
import { ClockSlideNode } from '@APP@/src/pages/home/clock-slide';
import { WeatherSlideNode } from '@APP@/src/pages/home/weather-slide';
import { VolumesRingsSlideNode } from '@APP@/src/pages/home/rings-slide';
import { NotificationsSlideNode } from '@APP@/src/pages/home/notifications-slide';
import { MacNotification, storedNotifications } from '@APP@/src/services/notify-service';
import { spotifyBrowser } from '@APP@/src/pages/spotify/spotify-views';
import { spotifyCatalog } from '@APP@/src/services/spotify-catalog';
import { RoomsPageNode } from '@APP@/src/pages/rooms/rooms-page';
import { RadiosPageNode } from '@APP@/src/pages/radios/radios-page';
import { SettingsPageNode } from '@APP@/src/pages/settings/settings-page';
import { SpotifyPageNode } from '@APP@/src/pages/spotify/spotify-page';
import { ContextSheetNode } from '@APP@/src/components/context-sheet';
import { VolumePopoverNode } from '@APP@/src/components/volume-popover';
import { SidebarNode } from '@APP@/src/components/sidebar';
import { StatusBarNode } from '@APP@/src/components/status-bar';
import { getCurrentWeatherForecast } from '@APP@/src/services/weather-service';

class FixtureStatusBar extends StatusBarNode {
  override onUpdate(delta: number): void {}
}
appState.batteryLevelPercent = 100;
appState.isBatteryCharging = true;

class FixtureSpotify extends Spotify {
  override async find(query: string): Promise<Found> {
    const found = new Found();
    const artist = new Item();
    artist.name = 'Un artiste'; artist.kind = 'artist'; artist.uri = 'spotify:artist:fixture';
    found.artists.push(artist);
    const song = new Item();
    song.name = 'Le titre'; song.kind = 'track'; song.uri = 'spotify:track:fixture'; song.subtitle = artist.name;
    found.tracks.push(song);
    return found;
  }
}
class FixtureSystem extends System {
  override async refresh(): Promise<void> {}
  override async update(group: Group): Promise<void> {}
  override async readVolumes(group: Group): Promise<void> {}
  override async play(group: Group): Promise<void> { console.log('PLAY'); }
  override async pause(group: Group): Promise<void> { console.log('PAUSE'); }
  override async setGroupVolume(group: Group, volume: i32): Promise<void> { console.log('VOLUME'); group.volume = volume; }
  override async setVolume(speaker: Speaker, volume: i32): Promise<void> { speaker.volume = volume; }
}
const system = new FixtureSystem('127.0.0.1');
for (let i = 0; i < 8; i++) {
  const group = new Group();
  const speaker = new Speaker();
  speaker.name = i === 0 ? 'Salon + Bureau' : 'Pièce ' + i;
  speaker.uuid = 'ROOM_' + i;
  speaker.ip = '127.0.0.1';
  speaker.volume = 30;
  group.id = 'GROUP_' + i;
  group.coordinator = speaker;
  group.members = [speaker];
  group.state = 'PAUSED_PLAYBACK';
  group.volume = 30;
  group.track.title = 'Le titre';
  group.track.artist = 'Un artiste';
  group.track.album = 'Album';
  group.track.source = 'queue';
  group.track.duration = 180;
  group.track.position = 33;
  system.groups.push(group);
  system.speakers.push(speaker);
}
appState.sonosSystem = system;
appState.activeGroup = system.groups[0];
appState.trackPositionBaseSeconds = 33;
for (let i = 0; i < appState.myStations.length; i++) appState.myStations[i].artworkUrl = '';
const mode = env('MUSIC_TEST_VIEW');
if (mode === 'context' || mode === 'volume') {
  system.groups[0].members = system.speakers;
  appState.isContextSheetOpen = mode === 'context';
  appState.isVolumePopoverOpen = mode === 'volume';
}
if (mode === 'rooms') appState.currentPage = 3;
if (mode === 'radios') appState.currentPage = 1;
if (mode === 'spotify' || mode === 'artist' || mode === 'album' || mode === 'search') appState.currentPage = 2;
if (mode === 'artist' || mode === 'album') {
  appState.spotifyClient.problem = '';
  spotifyCatalog.isOffline = true;
  const item = new Item();
  item.name = mode === 'artist' ? 'Un artiste' : 'Un album à écouter';
  item.subtitle = 'Un artiste';
  item.artistId = 'fixture';
  item.uri = 'spotify:' + mode + ':fixture';
  item.kind = mode;
  spotifyBrowser.open(mode, item);
}
if (mode === 'search') {
  appState.spotifyClient = new FixtureSpotify('spotify.json');
  appState.spotifyClient.problem = '';
  spotifyBrowser.open('search', new Item());
  appState.isKeyboardVisible = false;
  appState.searchQuery = 'Un artiste';
}
if (mode === 'notifications') {
  const notification = new MacNotification();
  notification.appId = 'fixture';
  notification.appName = 'Messages';
  notification.id = 'fixture';
  notification.title = 'Un message';
  notification.body = 'Les notifications restent lisibles sur un petit écran.';
  storedNotifications.push(notification);
}
if (mode === 'settings') appState.currentPage = 4;
const forecast = getCurrentWeatherForecast();
forecast.isLoaded = true;
forecast.cityName = 'Paris';
forecast.currentTemp = 18;
forecast.dailyLowTemps = [8, 9, 10, 11, 10, 9, 8];
forecast.dailyHighTemps = [18, 19, 20, 21, 20, 19, 18];
forecast.dailyWeatherCodes = [0, 0, 0, 0, 0, 0, 0];
forecast.hourlyTemps = [12, 16, 18, 20, 21, 19, 16, 12];
forecast.hourlyWeatherCodes = [0, 0, 0, 0, 0, 0, 0, 0];
forecast.hourlyRainProbabilities = [0, 0, 0, 0, 0, 0, 0, 0];
forecast.hourlyLabels = ['0 h', '3 h', '6 h', '9 h', '12 h', '15 h', '18 h', '21 h'];

class FixtureStage extends Stage {
  readonly player = new PlayerSlideNode();
  readonly clock = new ClockSlideNode();
  readonly weather = new WeatherSlideNode();
  readonly rings = new VolumesRingsSlideNode();
  readonly notifications = new NotificationsSlideNode();
  readonly rooms = new RoomsPageNode();
  readonly radios = new RadiosPageNode();
  readonly spotify = new SpotifyPageNode();
  readonly settings = new SettingsPageNode();
  readonly sidebar = new SidebarNode();
  readonly context = new ContextSheetNode();
  readonly volume = new VolumePopoverNode();
  readonly status = new FixtureStatusBar();
  readonly views: DisplayObject[] = [this.player, this.radios, this.spotify, this.rooms, this.settings];
  constructor() {
    super();
    this.color = 0x101012;
    for (let i = 0; i < this.views.length; i++) this.addChild(this.views[i]);
    this.addChild(this.clock); this.addChild(this.weather); this.addChild(this.rings); this.addChild(this.notifications);
    this.addChild(this.sidebar); this.addChild(this.context); this.addChild(this.volume); this.addChild(this.status);
  }
  override onMeasure(): void {
    const w = this.width;
    const h = this.height - 30;
    appState.sidebarWidth = appState.config.fullScreenPlayer ? 0 : isCompactScreen(w, this.height) ? 64 : 240;
    for (let i = 0; i < this.views.length; i++) this.views[i].visible = appState.currentPage === i;
    this.clock.visible = mode === 'clock';
    this.weather.visible = mode === 'weather';
    this.rings.visible = mode === 'rings';
    this.notifications.visible = mode === 'notifications' || mode === 'notifications-empty' || mode === 'pairing';
    if (this.clock.visible || this.weather.visible || this.rings.visible || this.notifications.visible) this.player.visible = false;
    for (let i = 0; i < this.children.length; i++) {
      this.children[i].width = w;
      this.children[i].height = this.children[i] === this.status ? this.height : h;
      this.children[i].y = this.children[i] === this.status ? 0 : 30;
    }
  }
}
const stage = new FixtureStage();
let frames = 0;
onFrame((dt: number) => {
  stage.frame(dt);
  frames++;
  if (frames === 2 || frames === (mode === 'search' ? 58 : 18)) {
    const zones = takeTouchZones();
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      if (zone.width > 0 && zone.height > 0 && (zone.x < -0.1 || zone.y < -0.1 || zone.x + zone.width > width() + 0.1 || zone.y + zone.height > height() + 0.1)) {
        throw new Error('offscreen touch zone: ' + zone.id + ' at ' + zone.x + ',' + zone.y + ' size ' + zone.width + ',' + zone.height);
      }
    }
    if (frames === (mode === 'search' ? 58 : mode === 'pairing' ? 18 : 2)) {
      const wanted = mode === 'artist' ? 'sp/a/radio' : mode === 'album' ? 'sp/c/play' : mode === 'notifications' || mode === 'notifications-empty' ? 'notif/add' : mode === 'search' ? 'sp/best' : mode === 'pairing' ? 'pair/next' : '';
      if (wanted !== '' && !zones.some((zone) => zone.id === wanted)) throw new Error('missing control: ' + wanted);
    }
    restoreTouchZones(zones);
    console.log('bounds OK; context=' + appState.isContextSheetOpen);
  }
});
