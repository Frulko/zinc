// ============================================================================
// services/spotify-catalog.ts — What the Spotify page shows, read once
// ============================================================================
// Every answer of the Web API is kept by what was asked (going back costs
// nothing on a slow tablet): the library's lists, a search of each kind, an
// artist, its albums and songs, an album, a playlist. A list is read a page at
// a time; the next page when its end comes into view. A search waits for the
// typing to pause. Answers are keyed by what they answer, so a slow one never
// shows under newer words; a reset (another account) drops those in flight.

import { Item, Found } from 'zinc:spotify';
import { SPOTIFY_PAGE_SIZE } from '../constants';
import { uiState } from '../core/input';
import { appState, explainSpotifyError } from '../state';

/** The library's lists: playlists, albums, liked songs, recent plays. */
export const LIBRARY_KEYS: string[] = ['lib/0', 'lib/1', 'lib/2', 'lib/3'];
/** A search's page of one kind, an artist's albums and songs come 10 at a time (Spotify's limit for an app in development mode). */
const SMALL_PAGE_SIZE: i32 = 10;
const SEARCH_WAIT_MS = 350;
const STATE_LOADING = 'loading';
const STATE_DONE = 'ok';
const STATE_HAS_MORE = 'more';

class SpotifyCatalog {
  private lists = new Map<string, Item[]>();
  private founds = new Map<string, Found>();
  /** key -> 'loading', 'ok', 'more' (a next page exists) or an error to show. */
  private states = new Map<string, string>();
  /** Bumped by reset(): an answer of an older generation is dropped, and the page goes back to the library. */
  generation: i32 = 0;
  private typedQuery = '';
  private typedWordsTrimmed = '';
  private typedAtMs = 0;
  /** The words whose search was started: what the search view shows. */
  askedQuery = '';
  /** True while a page is drawn offscreen (the warm-up): nothing is asked for then. */
  isOffline = false;

  /** The list behind a key, its first page asked for when it was never asked: lib/<tab>, find/<kind>/<words>, artist/<id>,
   *  albums/<artist id>, songs/<artist name>, album/<id>, playlist/<id>. */
  list(key: string): Item[] {
    const known = this.lists.get(key);
    if (known !== undefined) return known as Item[];
    if (this.states.get(key) === undefined && !this.isOffline) this.load(key, 0);
    return EMPTY_ITEMS;
  }

  /** 'loading' (or never asked), 'ok', 'more' or the error to show. */
  stateOf(key: string): string {
    const state = this.states.get(key);
    return state !== undefined ? (state as string) : STATE_LOADING;
  }

  hasMore(key: string): boolean {
    return this.states.get(key) === STATE_HAS_MORE;
  }

  /** The next page of a list, when its end comes into view (once at a time). */
  loadMore(key: string): void {
    if (this.states.get(key) !== STATE_HAS_MORE || this.isOffline) return;
    const known = this.lists.get(key);
    this.load(key, known !== undefined ? ((known as Item[]).length as i32) : 0);
  }

  private async load(key: string, offset: i32): Promise<void> {
    const generation = this.generation;
    this.states.set(key, STATE_LOADING);
    try {
      const page = await this.fetchPage(key, offset);
      if (generation !== this.generation) return;
      const known = this.lists.get(key);
      const all: Item[] = offset > 0 && known !== undefined ? (known as Item[]) : [];
      for (let index = 0; index < page.length; index++) all.push(page[index]);
      this.lists.set(key, all);
      const pageSize =
        key.startsWith('find/') || key.startsWith('albums/') || key.startsWith('songs/') ? SMALL_PAGE_SIZE : SPOTIFY_PAGE_SIZE;
      const isPaged = key !== 'lib/3' && !key.startsWith('album/') && !key.startsWith('artist/');
      this.states.set(key, isPaged && page.length >= pageSize ? STATE_HAS_MORE : STATE_DONE);
    } catch (error) {
      if (generation !== this.generation) return;
      this.states.set(key, explainSpotifyError(error.message));
    }
    uiState.dirty = true;
  }

  private async fetchPage(key: string, offset: i32): Promise<Item[]> {
    const client = appState.spotifyClient;
    const kind = key.slice(0, key.indexOf('/'));
    const rest = key.slice(kind.length + 1);
    if (kind === 'lib') {
      if (rest === '0') return await client.playlists(offset, SPOTIFY_PAGE_SIZE);
      if (rest === '1') return await client.albums(offset, SPOTIFY_PAGE_SIZE);
      if (rest === '2') return await client.likedTracks(offset, SPOTIFY_PAGE_SIZE);
      return await client.recent();
    }
    if (kind === 'find') {
      const searchKind = rest.slice(0, rest.indexOf('/'));
      return await client.findMore(rest.slice(searchKind.length + 1), searchKind, offset);
    }
    if (kind === 'artist') return [await client.artist(rest)];
    if (kind === 'albums') return await client.artistAlbums(rest, offset);
    if (kind === 'songs') return await client.artistTracks(rest, offset);
    if (kind === 'album') return await client.album(rest);
    return await client.playlist(rest, offset);
  }

  /** What a search of every kind found for these words; null while it comes (it is asked for when it was never asked). */
  found(words: string): Found | null {
    const known = this.founds.get(words);
    if (known !== undefined) return known as Found;
    const key = 'all/' + words;
    if (this.states.get(key) === undefined && !this.isOffline) this.searchEveryKind(words, key);
    return null;
  }

  private async searchEveryKind(words: string, key: string): Promise<void> {
    const generation = this.generation;
    this.states.set(key, STATE_LOADING);
    try {
      const found = await appState.spotifyClient.find(words);
      if (generation !== this.generation) return;
      this.founds.set(words, found);
      this.states.set(key, STATE_DONE);
    } catch (error) {
      if (generation !== this.generation) return;
      this.states.set(key, explainSpotifyError(error.message));
    }
    uiState.dirty = true;
  }

  /** The library's first pages, one after the other, ahead of the first visit. */
  async preload(): Promise<void> {
    for (let index = 0; index < LIBRARY_KEYS.length; index++) {
      const key = LIBRARY_KEYS[index];
      if (this.states.get(key) === undefined) await this.load(key, 0);
    }
  }

  /** Everything forgotten: another account, or the same one logged in again. */
  reset(): void {
    this.generation++;
    this.lists.clear();
    this.founds.clear();
    this.states.clear();
    this.askedQuery = '';
    uiState.dirty = true;
  }

  /** A list already read, or null (no request): the idle prefetch of the covers. */
  loadedList(key: string): Item[] | null {
    const known = this.lists.get(key);
    return known !== undefined ? (known as Item[]) : null;
  }

  /** Each frame on the page: the words of the search field; their search starts once the typing pauses. */
  tick(words: string): void {
    if (words !== this.typedQuery) {
      this.typedQuery = words;
      this.typedWordsTrimmed = words.trim();
      this.typedAtMs = performance.now();
    }
    const trimmed = this.typedWordsTrimmed;
    if (trimmed === '' || trimmed === this.askedQuery) return;
    if (performance.now() - this.typedAtMs >= SEARCH_WAIT_MS) {
      this.askedQuery = trimmed;
      this.found(trimmed);
      uiState.dirty = true;
    } else {
      uiState.animating = true; // a frame comes when the wait is over
    }
  }

  /** The words typed, trimmed (the search view shows a spinner until they are the asked ones). */
  typedWords(): string {
    return this.typedWordsTrimmed;
  }
}

const EMPTY_ITEMS: Item[] = [];

export const spotifyCatalog = new SpotifyCatalog();
