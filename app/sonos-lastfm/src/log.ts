import { ErrorLog, Listen } from 'zinc:lastfm';
import { System, Group } from 'zinc:sonos';

function time(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const n = Math.floor(seconds);
  return Math.floor(n / 60).toString() + ':' + ('0' + (n % 60).toString()).slice(-2);
}
function line(text: string): string {
  return text.split('\r').join(' ').split('\n').join(' ').split('\x1b').join('');
}

/** Keep track position and observed listening separate, especially after a seek or a mid-track start. */
export function playbackInfo(room: string, state: string, source: string, listen: Listen, status: string): string {
  const track = listen.track;
  let detail = 'listened ' + time(listen.heard) + '/' + time(Math.min(track.duration / 2, 240)) + ' to scrobble';
  if (!Number.isFinite(track.duration) || track.duration <= 0) detail = 'not scrobbling: unknown duration';
  else if (track.duration <= 30) detail = 'not scrobbling: track is 30s or shorter';
  else if (track.artist.trim() === '' || track.title.trim() === '') detail = 'not scrobbling: missing artist/title';
  else if (!Number.isFinite(track.position) || track.position < 0) detail = 'not scrobbling: unknown position';
  else if (status !== '') detail = status;
  return '[' + line(room) + '] ' + line(state) + ' | ' + line(track.artist === '' ? '(unknown artist)' : track.artist) + ' - ' +
    line(track.title === '' ? '(no track)' : track.title) + (track.album !== '' ? ' | album: ' + line(track.album) : '') +
    ' | ' + time(track.position) + '/' + time(track.duration) + ' | ' + detail + ' | source: ' + line(source);
}

/** Playback position and accumulated time are progress, not new log events. */
export function playbackChangeKey(room: string, state: string, source: string, listen: Listen, status: string): string {
  return JSON.stringify([room, state, source, listen.track.key(), listen.track.duration.toString(), listen.started.toString(), status,
    Number.isFinite(listen.track.position) && listen.track.position >= 0 ? 'position available' : 'position unavailable']);
}

/** Event-only console output; polling progress stays available through /status. */
export class Log extends ErrorLog {
  topologySnapshot: string = '';
  playbackChanges: Map<string, string> = new Map<string, string>();

  disconnected(): void {
    this.topologySnapshot = '';
    this.playbackChanges.clear();
  }

  topology(system: System): void {
    const snapshot = JSON.stringify(system.groups.map((group: Group) => [
      group.coordinator.uuid,
      group.name(),
      group.members.map((speaker) => speaker.uuid).sort().join(','),
    ]));
    if (snapshot === this.topologySnapshot) return;
    this.topologySnapshot = snapshot;
    console.log('Sonos: ' + system.speakers.length.toString() + ' rooms, ' + system.groups.length.toString() +
      ' groups: ' + system.groups.map((group: Group) => group.name()).join('; '));
  }

  playback(group: Group, listen: Listen, status: string): void {
    const key = playbackChangeKey(group.name(), group.state, group.track.source, listen, status);
    if (this.playbackChanges.get(listen.group) === key) return;
    this.playbackChanges.set(listen.group, key);
    const time = new Date().toISOString().slice(11, 19);
    console.log(time + ' UTC ' + playbackInfo(group.name(), group.state, group.track.source, listen, status));
  }
}
