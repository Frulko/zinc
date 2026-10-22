// ============================================================================
// pages/spotify/spotify-pieces.ts — What the Spotify views draw
// ============================================================================
// A list's status, a grid of covers, a cover's tile and its play button, the
// rows of songs and a song's row, and a song's menu. Lists draw only the rows
// they show; a row's menu and a touched album, artist or playlist go through
// `spotifyNavigation`, which the stack of views (spotify-views.ts) sets.

import { rrect, drawText, textWidth, fontAscent } from 'zinc:gfx';
import { Item } from 'zinc:spotify';
import {
  COLOR_CARD_ELEVATED,
  COLOR_FILL,
  COLOR_GREEN,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  PAGE_PADDING,
  PAGE_SPOTIFY,
} from '../../constants';
import { Fonts } from '../../fonts';
import {
  DisplayObject,
  ScrollBox,
  beginScrollBox,
  endScrollBox,
  isZonePressed,
  registerTapZone,
  uiState,
} from 'zinc:stage';
import {
  drawCenteredText,
  drawGlyph,
  drawLabel,
  drawTransportIcon,
  drawWrappedText,
  formatDurationClock,
} from '../../components/primitives';
import { drawIconButton } from '../../components/buttons';
import { drawActivitySpinner } from '../../components/slider';
import { drawCoverArt } from '../../components/cover';
import { getTouchKeyboardHeight } from '../../components/keyboard';
import { appState } from '../../state';
import { spotifyCatalog } from '../../services/spotify-catalog';
import { playSpotifyItem, playSpotifyRadio, queueOnSpeakers } from '../../services/spotify-on-sonos';

export const ROW_HEIGHT = 64;
export const GRID_COLUMN_COUNT: i32 = 4;
export const GRID_GAP_X = 24;
/** Where a view's content starts under the page's header. */
export const CONTENT_TOP_Y = 100;

export function contentLeftX(): number {
  return appState.sidebarWidth + PAGE_PADDING;
}

export function contentWidthOf(viewWidth: number): number {
  return viewWidth - appState.sidebarWidth - PAGE_PADDING * 2;
}

export function spotifyScrollBox(): ScrollBox {
  return appState.pageScrollBoxes[PAGE_SPOTIFY];
}

export function idOfUri(uri: string): string {
  return uri.split(':').pop() as string;
}

/** The scroll box of a view's list: from the sidebar's edge to the screen's, so the rows' pressed backgrounds fit. */
export function beginViewScroll(topY: number, bottomY: number, viewWidth: number): ScrollBox {
  const scrollBox = spotifyScrollBox();
  beginScrollBox(scrollBox, appState.sidebarWidth, topY, viewWidth - appState.sidebarWidth, bottomY - topY);
  return scrollBox;
}

/** What the pieces ask of the stack of views, and the song whose menu is open (with the bottom of its row). */
class SpotifyNavigation {
  open: (kind: string, item: Item) => void = (kind: string, item: Item) => {};
  menuSong: Item | null = null;
  menuAnchorY = 0;
}

export const spotifyNavigation = new SpotifyNavigation();

/** An item touched: a song plays, an artist, album or playlist opens. */
export function touchSpotifyItem(item: Item): void {
  if (item.kind === 'artist' || item.kind === 'album' || item.kind === 'playlist') spotifyNavigation.open(item.kind, item);
  else playSpotifyItem(item);
}

function openSongMenu(song: Item, anchorY: number): void {
  spotifyNavigation.menuSong = song;
  spotifyNavigation.menuAnchorY = anchorY;
  uiState.dirty = true;
}

function closeSongMenu(): void {
  spotifyNavigation.menuSong = null;
  uiState.dirty = true;
}

export function artistOf(item: Item): Item {
  const artist = new Item();
  artist.kind = 'artist';
  artist.uri = 'spotify:artist:' + item.artistId;
  artist.name = item.subtitle.split(', ')[0];
  return artist;
}

// ----------------------------------------------------------------------------
// The pieces: status, grid, tile, rows, row, the song's menu
// ----------------------------------------------------------------------------

/** A spinner while a list comes, its error (wrapped) when it failed; true when the list may be drawn. */
export function drawListStatus(key: string, left: number, y: number, width: number): boolean {
  const state = spotifyCatalog.stateOf(key);
  if (state === 'loading') {
    drawActivitySpinner(left + width / 2, y + 60, 16);
    return false;
  }
  if (state !== 'ok' && state !== 'more') {
    drawWrappedText(Fonts.label, left, y + 40, state, COLOR_TEXT_SECONDARY, width, 3, 28);
    return false;
  }
  return true;
}

/** Under a list with a next page: a spinner, and the page asked for once the end comes near. Returns the y under it. */
export function drawNextPageSpinner(key: string, left: number, y: number, width: number, isEndNear: boolean): number {
  if (!spotifyCatalog.hasMore(key)) return y;
  drawActivitySpinner(left + width / 2, y + 20, 12);
  if (isEndNear) spotifyCatalog.loadMore(key);
  return y + 50;
}

export function drawTileGrid(items: Item[], zonePrefix: string, left: number, topY: number, width: number, bottomY: number, viewWidth: number, key: string): void {
  const tileSize = (width - GRID_GAP_X * (GRID_COLUMN_COUNT - 1)) / GRID_COLUMN_COUNT;
  const rowHeight = tileSize + 62;
  const scrollBox = beginViewScroll(topY, bottomY, viewWidth);
  for (let index = 0; index < items.length; index++) {
    const tileY = topY + 4 + Math.floor(index / GRID_COLUMN_COUNT) * rowHeight - scrollBox.scrollY;
    if (tileY < bottomY && tileY + rowHeight > topY) {
      drawTile(items[index], `${zonePrefix}/${index}`, left + (index % GRID_COLUMN_COUNT) * (tileSize + GRID_GAP_X), tileY, tileSize);
    }
  }
  const listHeight = Math.ceil(items.length / GRID_COLUMN_COUNT) * rowHeight + 24;
  const isEndNear = scrollBox.scrollY + scrollBox.viewportHeight > listHeight - 600;
  const bottomOfList = drawNextPageSpinner(key, left, topY + listHeight - scrollBox.scrollY, width, isEndNear);
  if (items.length === 0) drawCenteredText(Fonts.label, left + width / 2, topY + 60, 'Rien ici pour le moment', COLOR_TEXT_SECONDARY);
  scrollBox.contentHeight = bottomOfList + scrollBox.scrollY - topY;
  endScrollBox();
}

export function drawTile(item: Item, zoneId: string, x: number, y: number, size: number): void {
  if (isZonePressed(zoneId)) rrect(x - 6, y - 6, size + 12, size + 12, 18, 0xffffff, 30);
  const isRound = item.kind === 'artist';
  drawCoverArt(item.art, item.name, x, y, size, isRound ? size / 2 : 12);
  if (isRound) {
    drawLabel(Fonts.smallBold, x + Math.max(0, (size - textWidth(Fonts.smallBold, item.name, 0)) / 2), y + size + 10, item.name, COLOR_TEXT_PRIMARY, size);
  } else {
    drawLabel(Fonts.smallBold, x, y + size + 10, item.name, COLOR_TEXT_PRIMARY, size);
    if (item.subtitle !== '') {
      drawLabel(Fonts.tiny, x, y + size + 32, item.year !== '' ? `${item.subtitle} · ${item.year}` : item.subtitle, COLOR_TEXT_SECONDARY, size);
    }
  }
  registerTapZone(zoneId, x, y, size, size + 50, () => touchSpotifyItem(item));
  if (!isRound && size >= 90) drawPlayButton(zoneId + '/play', x + size - 52, y + size - 52, item);
}

/** The green round button on a cover: plays it without opening it. */
export function drawPlayButton(zoneId: string, x: number, y: number, item: Item): void {
  rrect(x, y, 44, 44, 22, COLOR_GREEN, isZonePressed(zoneId) ? 190 : 255);
  drawTransportIcon('play', x + 24, y + 22, 18, 0x000000);
  registerTapZone(zoneId, x - 4, y - 4, 52, 52, () => playSpotifyItem(item));
}

export function drawSongRows(
  items: Item[],
  zonePrefix: string,
  left: number,
  topY: number,
  width: number,
  bottomY: number,
  viewWidth: number,
  key: string,
  hasLikedSongsHead: boolean
): void {
  const scrollBox = beginViewScroll(topY, bottomY, viewWidth);
  const headRows: i32 = hasLikedSongsHead ? 1 : 0;
  if (hasLikedSongsHead) {
    const headY = topY - scrollBox.scrollY;
    const headZoneId = zonePrefix + '/head';
    if (isZonePressed(headZoneId)) rrect(left - 10, headY, width + 20, ROW_HEIGHT, 10, COLOR_CARD_ELEVATED, 255);
    rrect(left, headY + 8, 48, 48, 8, COLOR_GREEN, 255);
    drawGlyph('heart', left + 12, headY + 20, 24, 0x000000);
    drawText(Fonts.bodyBold, left + 64, headY + 22, 'Lire tous les titres likés', COLOR_TEXT_PRIMARY, 255, 0);
    registerTapZone(headZoneId, left, headY, width, ROW_HEIGHT, () => playSpotifyItem(likedSongs));
  }
  for (let index = 0; index < items.length; index++) {
    const rowY = topY + (index + headRows) * ROW_HEIGHT - scrollBox.scrollY;
    if (rowY < bottomY && rowY + ROW_HEIGHT > topY) {
      drawSongRow(items[index], `${zonePrefix}/${index}`, left, rowY, width, false, index as i32, ROW_HEIGHT);
    }
  }
  const listHeight = (items.length + headRows) * ROW_HEIGHT + 24;
  const isEndNear = scrollBox.scrollY + scrollBox.viewportHeight > listHeight - 600;
  const bottomOfList = drawNextPageSpinner(key, left, topY + listHeight - scrollBox.scrollY, width, isEndNear);
  scrollBox.contentHeight = bottomOfList + scrollBox.scrollY - topY;
  endScrollBox();
}

/** One song (or an item of a search): its cover or number, its name and artists, its length, its menu. */
export function drawSongRow(item: Item, zoneId: string, x: number, y: number, width: number, isNumbered: boolean, index: i32, rowHeight: number): void {
  if (isZonePressed(zoneId)) rrect(x - 10, y, width + 20, rowHeight, 10, COLOR_CARD_ELEVATED, 255);
  const coverY = y + (rowHeight - 46) / 2;
  if (isNumbered) drawCenteredText(Fonts.label, x + 23, coverY + 12, '' + (index + 1), COLOR_TEXT_SECONDARY);
  else drawCoverArt(item.thumb !== '' ? item.thumb : item.art, item.name, x, coverY, 46, item.kind === 'artist' ? 23 : 6);
  const textWidthLeft = width - 64 - 110;
  drawLabel(Fonts.label, x + 62, coverY + 2, item.name, COLOR_TEXT_PRIMARY, textWidthLeft);
  drawLabel(Fonts.small, x + 62, coverY + 26, item.subtitle, COLOR_TEXT_SECONDARY, textWidthLeft);
  if (item.durationMs > 0) {
    drawText(Fonts.small, x + width - 96, coverY + 14, formatDurationClock(item.durationMs / 1000), COLOR_TEXT_SECONDARY, 255, 0);
  }
  registerTapZone(zoneId, x, y, width - 50, rowHeight, () => touchSpotifyItem(item));
  drawIconButton(zoneId + '/menu', 'ellipsis', x + width - 20, y + rowHeight / 2, 22, COLOR_TEXT_SECONDARY, () =>
    openSongMenu(item, y + rowHeight)
  );
}

const likedSongs = new Item();
likedSongs.kind = 'liked';
likedSongs.name = 'Titres likés';

const MENU_PLAY = 'Lire';
const MENU_PLAY_NEXT = 'Lire ensuite';
const MENU_ADD_TO_QUEUE = 'Ajouter à la file';
const MENU_SONG_RADIO = 'Radio du titre';
const MENU_GO_TO_ARTIST = "Aller à l'artiste";
const MENU_GO_TO_ALBUM = "Aller à l'album";

/** A song's actions, under its row (above it near the bottom); a touch elsewhere closes it. */
export class SongMenuNode extends DisplayObject {
  private actions: string[] = [];
  private actionsFor: Item | null = null;

  constructor() {
    super('SpotifySongMenu');
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    if (spotifyNavigation.menuSong === null) return;
    const song = spotifyNavigation.menuSong as Item;
    if (this.actionsFor !== song) {
      // the list of actions is made when a menu opens, not at each frame
      this.actionsFor = song;
      this.actions = [MENU_PLAY, MENU_PLAY_NEXT, MENU_ADD_TO_QUEUE, MENU_SONG_RADIO];
      if (song.artistId !== '') this.actions.push(MENU_GO_TO_ARTIST);
      if (song.context.startsWith('spotify:album:')) this.actions.push(MENU_GO_TO_ALBUM);
    }
    const left = contentLeftX();
    const width = contentWidthOf(viewWidth);
    const bottomY = viewHeight - getTouchKeyboardHeight();
    const menuWidth = 280;
    const actionHeight = 48;
    const menuHeight = this.actions.length * actionHeight + 12;
    const menuX = left + width - menuWidth;
    const anchorY = spotifyNavigation.menuAnchorY;
    const menuY = anchorY + menuHeight > bottomY ? Math.max(CONTENT_TOP_Y, anchorY - menuHeight - 64) : anchorY;
    rrect(appState.sidebarWidth, 0, viewWidth - appState.sidebarWidth, viewHeight, 0, 0x000000, 120);
    registerTapZone('sp/menu/veil', appState.sidebarWidth, 0, viewWidth - appState.sidebarWidth, viewHeight, () => closeSongMenu());
    rrect(menuX, menuY, menuWidth, menuHeight, 14, COLOR_CARD_ELEVATED, 255);
    for (let index = 0; index < this.actions.length; index++) {
      const action = this.actions[index];
      const zoneId = 'sp/menu/' + index;
      const actionY = menuY + 6 + index * actionHeight;
      if (isZonePressed(zoneId)) rrect(menuX + 6, actionY, menuWidth - 12, actionHeight, 10, COLOR_FILL, 255);
      drawText(Fonts.label, menuX + 20, actionY + (actionHeight - fontAscent(Fonts.label)) / 2 - 1, action, COLOR_TEXT_PRIMARY, 255, 0);
      registerTapZone(zoneId, menuX, actionY, menuWidth, actionHeight, () => runMenuAction(action, song));
    }
  }
}

function runMenuAction(action: string, song: Item): void {
  closeSongMenu();
  if (action === MENU_PLAY) playSpotifyItem(song);
  else if (action === MENU_PLAY_NEXT) queueOnSpeakers(song, true);
  else if (action === MENU_ADD_TO_QUEUE) queueOnSpeakers(song, false);
  else if (action === MENU_SONG_RADIO) playSpotifyRadio(song);
  else if (action === MENU_GO_TO_ARTIST) spotifyNavigation.open('artist', artistOf(song));
  else {
    const album = new Item();
    album.kind = 'album';
    album.uri = song.context;
    spotifyNavigation.open('album', album);
  }
}
