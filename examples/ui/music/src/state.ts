import { createSignal, onCleanup } from 'zinc:ui/solid';
import { Music, loadMusic } from 'zinc:audio';
import { Track, tracks } from './data';
export enum Playback { Stopped, Paused, Playing, Failed, Disposed }
export function createLibrary() {
  const [collection, setCollection] = createSignal('All music');
  const [query, setQuery] = createSignal('');
  const [currentId, setCurrentId] = createSignal(tracks[0].id);
  const [queue, setQueue] = createSignal<string[]>(tracks.map((track: Track) => track.id));
  const [state, setState] = createSignal<Playback>(Playback.Stopped);
  const [position, setPosition] = createSignal(0);
  const [duration, setDuration] = createSignal(tracks[0].duration);
  const [volume, setVolume] = createSignal(55);
  const [notice, setNotice] = createSignal('Six original, eight-second sound sketches. Select a track, then Play.');
  let music: Music | null = null;
  let timer: i32 = 0;
  let generation: i32 = 0;
  const transition = (next: Playback): boolean => {
    const previous = state();
    if (previous === Playback.Disposed) return false;
    const legal = next === Playback.Disposed || next === Playback.Stopped || next === Playback.Failed ||
      next === Playback.Paused && music !== null ||
      next === Playback.Playing && previous === Playback.Paused && music !== null;
    if (legal) setState(next);
    return legal;
  };
  const cancelPoll = (): void => { generation++; clearTimeout(timer); timer = 0; };
  const current = (): Track => tracks.find((track: Track) => track.id === currentId()) ?? tracks[0];
  const visible = (): Track[] => tracks.filter((track: Track) => (collection() === 'All music' || track.collection === collection()) && (track.title + ' ' + track.artist + ' ' + track.collection).toLowerCase().includes(query().trim().toLowerCase()));
  const closeMusic = (): void => { cancelPoll(); if (music !== null) music.close(); music = null; };
  const fail = (message: string): void => { closeMusic(); transition(Playback.Failed); setNotice('Could not play: ' + message); };
  const open = (): boolean => {
    if (state() === Playback.Disposed) return false;
    if (music !== null) return true;
    const loaded = loadMusic(current().file);
    if (loaded.error !== '' || !loaded.ready) { const error = loaded.error; loaded.close(); fail(error === '' ? 'The local sample is unavailable.' : error); return false; }
    music = loaded; music.volume = volume() / 100; setDuration(music.duration); music.seek(position());
    transition(Playback.Paused); return true;
  };
  function poll(): void {
    if (state() !== Playback.Playing || music === null) return;
    if (music.error !== '') { fail(music.error); return; }
    setPosition(music.position);
    if (music.ended) { advance(1, false); return; }
    const token = generation;
    timer = setTimeout(() => { if (token === generation) poll(); }, 100);
  }
  function play(playing: boolean): void {
    if (state() === Playback.Disposed) return;
    cancelPoll();
    if (!playing) {
      if (music !== null) { music.pause(); setPosition(music.position); transition(Playback.Paused); }
      return;
    }
    if (!open() || music === null) return;
    if (position() >= duration()) { music.seek(0); setPosition(0); }
    music.play(); transition(Playback.Playing); setNotice('Playing ' + current().title + ' · original local sample'); poll();
  }
  function select(id: string, autoplay: boolean = false): void {
    if (state() === Playback.Disposed || !tracks.some((track: Track) => track.id === id)) return;
    closeMusic(); transition(Playback.Stopped); setCurrentId(id); setPosition(0); setDuration(current().duration);
    if (queue().indexOf(id) < 0) setQueue(queue().concat([id]));
    setNotice(current().title + ' selected'); if (autoplay) play(true);
  }
  function advance(direction: i32, manual: boolean = true): void {
    const list = queue(), index = list.indexOf(currentId()), next = index + direction;
    if (next >= 0 && next < list.length) { select(list[next], manual ? state() === Playback.Playing : true); return; }
    if (manual && direction < 0) { seek(0); return; }
    play(false); if (!manual) setNotice('Queue finished');
  }
  function seek(seconds: number): void {
    if (!Number.isFinite(seconds) || state() === Playback.Disposed) return;
    const value = Math.max(0, Math.min(duration(), seconds)); setPosition(value);
    if (music !== null) music.seek(value);
  }
  const changeVolume = (value: number): void => {
    if (!Number.isFinite(value) || state() === Playback.Disposed) return;
    setVolume(Math.max(0, Math.min(100, value))); if (music !== null) music.volume = volume() / 100;
  };
  const enqueue = (id: string): void => {
    if (state() === Playback.Disposed || queue().indexOf(id) >= 0 || !tracks.some((track: Track) => track.id === id)) return;
    setQueue(queue().concat([id])); setNotice('Added ' + (tracks.find((track: Track) => track.id === id)?.title ?? '') + ' to queue');
  };
  const move = (id: string, direction: i32): void => {
    const list = queue().slice(), index = list.indexOf(id), next = index + direction;
    if (state() === Playback.Disposed || index < 0 || next < 0 || next >= list.length) return;
    list[index] = list[next]; list[next] = id; setQueue(list); setNotice('Queue order updated');
  };
  const remove = (id: string): void => {
    if (state() === Playback.Disposed) return;
    setQueue(queue().filter((item: string) => item !== id));
    if (id === currentId()) { closeMusic(); transition(Playback.Stopped); setPosition(0); }
    setNotice('Removed from queue');
  };
  const stop = (): void => { if (state() === Playback.Disposed) return; closeMusic(); transition(Playback.Stopped); setPosition(0); setNotice('Playback stopped'); };
  onCleanup(() => { closeMusic(); transition(Playback.Disposed); });
  return { collection, setCollection, query, setQuery, visible, currentId, current, queue, state, position, duration, volume, notice, play, select, advance, seek, changeVolume, enqueue, move, remove, stop };
}
export type LibraryModel = ReturnType<typeof createLibrary>;
