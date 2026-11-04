import { System, Group, discover } from 'zinc:sonos';
import { Track, observe, eligible, entry } from './tracker';
import { Store } from './store';
import { Log } from './log';

/** Read Sonos and record eligible listens. Last.fm delivery runs independently. */
export class SonosMonitor {
  system: System = new System('');
  nowPlaying: Track | null = null;
  address: string;
  interval: number;
  store: Store;
  log: Log;
  nextDiscovery: number = 0;
  nextSave: number = 0;

  constructor(address: string, interval: number, store: Store, log: Log) {
    this.address = address;
    this.interval = interval;
    this.store = store;
    this.log = log;
  }

  async update(): Promise<void> {
    const now = Date.now() / 1000;
    if (now >= this.nextDiscovery) await this.refresh(now);

    const reads: Promise<void>[] = [];
    for (const group of this.system.groups) reads.push(this.readGroup(group));
    await Promise.all(reads);

    if (now >= this.nextSave) {
      this.store.save();
      this.nextSave = now + 15;
    }
  }

  async refresh(now: number): Promise<void> {
    try {
      const address = this.address !== '' ? this.address : this.system.seed;
      this.system = await discover(address);
      this.nextDiscovery = now + 60;
    } catch (error) {
      for (const listen of this.store.listens) listen.track.playing = false;
      this.system = new System('');
      this.log.disconnected();
      this.log.error('Sonos discovery: ' + error.message + '; retrying (or supply --sonos ip:1400)');
      this.nextDiscovery = now + 10;
      return;
    }

    this.store.listens = this.store.listens.filter((listen) =>
      this.system.groups.some((group: Group) => group.coordinator.uuid === listen.group));
    this.log.topology(this.system);
  }

  async readGroup(group: Group): Promise<void> {
    const listen = this.store.listen(group.coordinator.uuid);
    try {
      await this.system.update(group);
    } catch (error) {
      listen.track.playing = false;
      this.log.error('Sonos ' + group.name() + ': ' + error.message);
      return;
    }

    const track = new Track();
    track.artist = group.track.artist;
    track.title = group.track.title;
    track.album = group.track.album;
    track.uri = group.track.uri;
    track.duration = group.track.duration;
    track.position = group.track.position;
    track.playing = group.state === 'PLAYING';

    if (!Number.isFinite(track.duration) || !Number.isFinite(track.position) || track.duration <= 0 || track.position < 0) {
      listen.track = track;
      listen.track.playing = false;
      this.log.playback(group, listen, '');
      return;
    }

    const previousTrack = listen.track.key();
    observe(listen, track, Date.now() / 1000, this.interval);
    if (eligible(listen)) {
      this.store.enqueue(entry(listen));
      listen.queued = true;
      this.store.save();
      console.log('Queued: ' + track.artist + ' - ' + track.title);
    }
    this.log.playback(group, listen, this.store.deliveryStatus(listen));

    if (track.playing && previousTrack !== track.key() && track.artist !== '' && track.title !== '') {
      this.nowPlaying = track;
    }
  }
}
