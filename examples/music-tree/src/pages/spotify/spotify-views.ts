// ============================================================================
// pages/spotify/spotify-views.ts — The Spotify page's views and their stack
// ============================================================================
// Like Spotify's app: the library (playlists, albums, liked songs, recent
// plays), a search while one types (a best result, songs, then artists,
// albums and playlists, or one kind at a time), and a page for an artist, an
// album and a playlist, with a back button. A song plays inside its album or
// playlist; its menu plays it next, adds it to the queue, plays its radio or
// opens its artist or album.
//
// Each view is a node built once when it is opened (the library and the search
// once for good); its fixed controls are child nodes, its scrolled list draws
// only the rows it shows. The page's one scroll box serves the view on top;
// each view keeps its scroll position for the way back.

import { rrect, drawText, textWidth } from 'zinc:gfx';
import { Item, Found } from 'zinc:spotify';
import {
  COLOR_CARD,
  COLOR_CARD_ELEVATED,
  COLOR_FILL,
  COLOR_GREEN,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_TERTIARY,
} from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject, endScrollBox, isZonePressed, registerTapZone, uiState } from 'zinc:stage';
import {
  drawCenteredText,
  drawLabel,
  drawWrappedText,
} from '../../components/primitives';
import { drawPillButton } from '../../components/buttons';
import { drawActivitySpinner } from '../../components/slider';
import { drawCoverArt } from '../../components/cover';
import { getTouchKeyboardHeight } from '../../components/keyboard';
import { PillButtonNode, SearchFieldNode, SegmentedControlNode } from '../../components/layout-nodes';
import { appState } from '../../state';
import { spotifyCatalog, LIBRARY_KEYS } from '../../services/spotify-catalog';
import { playSpotifyItem, playSpotifyRadio } from '../../services/spotify-on-sonos';
import {
  CONTENT_TOP_Y,
  GRID_COLUMN_COUNT,
  GRID_GAP_X,
  ROW_HEIGHT,
  artistOf,
  beginViewScroll,
  contentLeftX,
  contentWidthOf,
  drawListStatus,
  drawNextPageSpinner,
  drawPlayButton,
  drawSongRow,
  drawSongRows,
  drawTile,
  drawTileGrid,
  idOfUri,
  spotifyNavigation,
  spotifyScrollBox,
  touchSpotifyItem,
} from './spotify-pieces';

const LIBRARY_TAB_LABELS: string[] = ['Playlists', 'Albums', 'Titres likés', 'Récents'];
const SEARCH_KIND_LABELS: string[] = ['Tout', 'Titres', 'Artistes', 'Albums', 'Playlists'];
const SEARCH_KINDS: string[] = ['', 'track', 'artist', 'album', 'playlist'];
const SHELF_TILE_COUNT: i32 = 5;

// ----------------------------------------------------------------------------
// The stack of views
// ----------------------------------------------------------------------------

class SpotifyBrowser {
  /** The node that holds the view on top (the page's child). */
  readonly viewHost: DisplayObject = new DisplayObject('SpotifyViewHost');
  readonly libraryView: LibraryViewNode;
  readonly searchView: SearchViewNode;
  stack: SpotifyViewNode[] = [];
  private seenGeneration: i32 = 0;

  constructor() {
    this.libraryView = new LibraryViewNode();
    this.searchView = new SearchViewNode();
    this.stack.push(this.libraryView);
    this.viewHost.addChild(this.libraryView);
    spotifyNavigation.open = (kind: string, item: Item) => this.open(kind, item);
  }

  top(): SpotifyViewNode {
    return this.stack[this.stack.length - 1];
  }

  canGoBack(): boolean {
    return this.stack.length > 1;
  }

  isSearching(): boolean {
    return this.top() === this.searchView;
  }

  /** Opens a view on top: 'search', 'artist', 'album' or 'playlist' (of `item`). */
  open(kind: string, item: Item): void {
    let view: SpotifyViewNode;
    if (kind === 'search') {
      view = this.searchView;
      appState.searchQuery = '';
      appState.isKeyboardVisible = true;
    } else if (kind === 'artist') {
      view = new ArtistViewNode(item);
    } else {
      view = new CollectionViewNode(kind, item);
    }
    if (this.stack.indexOf(view) >= 0) return;
    this.show(view, 0);
    this.stack.push(view);
  }

  back(): void {
    if (this.stack.length <= 1) return;
    this.stack.pop();
    appState.isKeyboardVisible = false;
    this.show(this.top(), this.top().savedScrollY);
  }

  /** Back to the library (another account, or one logged in again). */
  home(): void {
    this.stack = [this.libraryView];
    this.show(this.libraryView, 0);
  }

  /** Each frame on the page: a reset of the catalog brings the library back. */
  followCatalog(): void {
    if (this.seenGeneration !== spotifyCatalog.generation) {
      this.seenGeneration = spotifyCatalog.generation;
      if (this.canGoBack()) this.home();
    }
  }

  private show(view: SpotifyViewNode, scrollY: number): void {
    const scrollBox = spotifyScrollBox();
    if (this.viewHost.children.length > 0) {
      (this.viewHost.children[0] as SpotifyViewNode).savedScrollY = scrollBox.scrollY;
    }
    this.viewHost.removeChildren();
    this.viewHost.addChild(view);
    scrollBox.scrollY = scrollY;
    scrollBox.velocityY = 0;
    spotifyNavigation.menuSong = null;
    uiState.dirty = true;
  }
}

/** A view of the page: its title for the header, and where its scroll stood when another view was opened over it. */
class SpotifyViewNode extends DisplayObject {
  savedScrollY = 0;

  title(): string {
    return 'Spotify';
  }
}

// ----------------------------------------------------------------------------
// The library
// ----------------------------------------------------------------------------

class LibraryViewNode extends SpotifyViewNode {
  readonly tabsNode: SegmentedControlNode;
  readonly searchButton: PillButtonNode;

  constructor() {
    super('SpotifyLibraryView');
    this.tabsNode = new SegmentedControlNode(
      'sp/lib',
      LIBRARY_TAB_LABELS,
      (selectedTab: i32) => {
        appState.activeSpotifyTab = selectedTab;
        spotifyScrollBox().scrollY = 0;
      },
      120
    );
    this.searchButton = new PillButtonNode('sp/search', 'Rechercher', 'search', () => spotifyBrowser.open('search', new Item()));
    this.addChild(this.tabsNode);
    this.addChild(this.searchButton);
  }

  override onMeasure(): void {
    const left = contentLeftX();
    this.tabsNode.x = left;
    this.tabsNode.y = CONTENT_TOP_Y;
    this.tabsNode.selectedIndex = appState.activeSpotifyTab;
    this.searchButton.x = left + contentWidthOf(this.width > 0 ? this.width : 1024) - 150;
    this.searchButton.y = CONTENT_TOP_Y;
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    const left = contentLeftX();
    const width = contentWidthOf(viewWidth);
    const listTopY = CONTENT_TOP_Y + 60;
    const bottomY = viewHeight - getTouchKeyboardHeight();
    const key = LIBRARY_KEYS[appState.activeSpotifyTab];
    const items = spotifyCatalog.list(key);
    if (!drawListStatus(key, left, listTopY, width)) return;
    if (appState.activeSpotifyTab <= 1) {
      drawTileGrid(items, 'sp/lib' + appState.activeSpotifyTab, left, listTopY, width, bottomY, viewWidth, key);
    } else {
      drawSongRows(items, 'sp/rows', left, listTopY, width, bottomY, viewWidth, key, appState.activeSpotifyTab === 2);
    }
  }
}

// ----------------------------------------------------------------------------
// The search
// ----------------------------------------------------------------------------

class SearchViewNode extends SpotifyViewNode {
  readonly searchFieldNode: SearchFieldNode;
  readonly kindsNode: SegmentedControlNode;
  kindTab: i32 = 0;

  constructor() {
    super('SpotifySearchView');
    this.searchFieldNode = new SearchFieldNode(
      'Titres, artistes, albums, playlists',
      () => {
        appState.isKeyboardVisible = true;
      },
      () => {
        appState.searchQuery = '';
      }
    );
    this.kindsNode = new SegmentedControlNode(
      'sp/kind',
      SEARCH_KIND_LABELS,
      (selectedKind: i32) => {
        this.kindTab = selectedKind;
        spotifyScrollBox().scrollY = 0;
      },
      110
    );
    this.addChild(this.searchFieldNode);
    this.addChild(this.kindsNode);
  }

  override title(): string {
    return 'Rechercher';
  }

  override onMeasure(): void {
    const left = contentLeftX();
    this.searchFieldNode.x = left;
    this.searchFieldNode.y = CONTENT_TOP_Y;
    this.searchFieldNode.width = contentWidthOf(this.width > 0 ? this.width : 1024);
    this.searchFieldNode.currentText = appState.searchQuery;
    this.searchFieldNode.isTypingActive = appState.isKeyboardVisible;
    this.kindsNode.x = left;
    this.kindsNode.y = CONTENT_TOP_Y + 66;
    this.kindsNode.selectedIndex = this.kindTab;
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    const left = contentLeftX();
    const width = contentWidthOf(viewWidth);
    const listTopY = CONTENT_TOP_Y + 126;
    const bottomY = viewHeight - getTouchKeyboardHeight();
    const words = spotifyCatalog.typedWords();
    if (words === '') {
      drawCenteredText(Fonts.label, left + width / 2, listTopY + 60, 'Titres, artistes, albums, playlists', COLOR_TEXT_TERTIARY);
      return;
    }
    if (spotifyCatalog.askedQuery !== words) {
      drawActivitySpinner(left + width / 2, listTopY + 60, 16); // the typing has not paused yet
      return;
    }
    if (this.kindTab > 0) {
      const key = `find/${SEARCH_KINDS[this.kindTab]}/${words}`;
      const items = spotifyCatalog.list(key);
      if (!drawListStatus(key, left, listTopY, width)) return;
      if (this.kindTab === 1) drawSongRows(items, 'sp/f', left, listTopY, width, bottomY, viewWidth, key, false);
      else drawTileGrid(items, 'sp/f', left, listTopY, width, bottomY, viewWidth, key);
      return;
    }
    const found = spotifyCatalog.found(words);
    if (!drawListStatus('all/' + words, left, listTopY, width) || found === null) return;
    this.drawEveryKind(found as Found, words, left, listTopY, width, bottomY, viewWidth);
  }

  /** The best result (an artist named like the words, else the first song) beside the first songs, then a shelf of each kind. */
  private drawEveryKind(found: Found, words: string, left: number, topY: number, width: number, bottomY: number, viewWidth: number): void {
    const scrollBox = beginViewScroll(topY, bottomY, viewWidth);
    let y = topY + 4 - scrollBox.scrollY;
    const wanted = words.toLowerCase();
    let best: Item | null = null;
    for (let index = 0; index < found.artists.length; index++) {
      const artistName = found.artists[index].name.toLowerCase();
      if (artistName === wanted || (best === null && artistName.startsWith(wanted))) best = found.artists[index];
    }
    if (best === null && found.tracks.length > 0) best = found.tracks[0];
    if (best === null && found.albums.length > 0) best = found.albums[0];
    const bestWidth = 290;
    const bestHeight = 4 * ROW_HEIGHT;
    if (best !== null) {
      const bestItem = best as Item;
      drawText(Fonts.heading, left, y, 'Meilleur résultat', COLOR_TEXT_PRIMARY, 255, 0);
      rrect(left, y + 36, bestWidth, bestHeight - 36, 14, isZonePressed('sp/best') ? COLOR_CARD_ELEVATED : COLOR_CARD, 255);
      drawCoverArt(bestItem.art, bestItem.name, left + 20, y + 56, 104, bestItem.kind === 'artist' ? 52 : 8);
      drawLabel(Fonts.title, left + 20, y + 176, bestItem.name, COLOR_TEXT_PRIMARY, bestWidth - 40);
      const kindName = bestItem.kind === 'artist' ? 'Artiste' : bestItem.kind === 'track' ? 'Titre' : 'Album';
      drawLabel(
        Fonts.small,
        left + 20,
        y + 212,
        bestItem.kind !== 'artist' && bestItem.subtitle !== '' ? `${kindName} · ${bestItem.subtitle}` : kindName,
        COLOR_TEXT_SECONDARY,
        bestWidth - 40
      );
      registerTapZone('sp/best', left, y + 36, bestWidth, bestHeight - 36, () => touchSpotifyItem(bestItem));
      drawPlayButton('sp/best/play', left + bestWidth - 64, y + 56, bestItem);
    }
    const songsX = best !== null ? left + bestWidth + 24 : left;
    const songsWidth = left + width - songsX;
    drawText(Fonts.heading, songsX, y, 'Titres', COLOR_TEXT_PRIMARY, 255, 0);
    const songCount = Math.min(4, found.tracks.length) as i32;
    for (let index: i32 = 0; index < songCount; index++) {
      drawSongRow(found.tracks[index], 'sp/ft/' + index, songsX, y + 36 + index * (ROW_HEIGHT - 6), songsWidth, false, index, ROW_HEIGHT - 6);
    }
    y += bestHeight + 28;
    y = this.drawShelf('Artistes', found.artists, 'sp/fa', left, y, width, 2, topY, bottomY);
    y = this.drawShelf('Albums', found.albums, 'sp/fal', left, y, width, 3, topY, bottomY);
    y = this.drawShelf('Playlists', found.playlists, 'sp/fp', left, y, width, 4, topY, bottomY);
    scrollBox.contentHeight = y + scrollBox.scrollY - topY + 24;
    endScrollBox();
  }

  /** A row of up to five covers with a title; "Tout afficher" picks that kind. Returns the y under it. */
  private drawShelf(
    title: string,
    items: Item[],
    zonePrefix: string,
    left: number,
    y: number,
    width: number,
    kindTab: i32,
    topY: number,
    bottomY: number
  ): number {
    if (items.length === 0) return y;
    const gap = 18;
    const tileSize = (width - gap * (SHELF_TILE_COUNT - 1)) / SHELF_TILE_COUNT;
    const shelfHeight = 40 + tileSize + 58;
    if (y > bottomY || y + shelfHeight < topY) return y + shelfHeight; // scrolled out: nothing drawn
    drawText(Fonts.heading, left, y, title, COLOR_TEXT_PRIMARY, 255, 0);
    const moreLabel = 'Tout afficher';
    const moreWidth = textWidth(Fonts.smallBold, moreLabel, 0);
    drawText(Fonts.smallBold, left + width - moreWidth, y + 6, moreLabel, COLOR_TEXT_SECONDARY, 255, 0);
    registerTapZone(zonePrefix + '/all', left + width - moreWidth - 10, y - 4, moreWidth + 20, 36, () => {
      this.kindTab = kindTab;
      spotifyScrollBox().scrollY = 0;
    });
    const tileCount = Math.min(SHELF_TILE_COUNT, items.length) as i32;
    for (let index: i32 = 0; index < tileCount; index++) {
      drawTile(items[index], `${zonePrefix}/${index}`, left + index * (tileSize + gap), y + 40, tileSize);
    }
    return y + shelfHeight;
  }
}

// ----------------------------------------------------------------------------
// An artist, an album, a playlist
// ----------------------------------------------------------------------------

class ArtistViewNode extends SpotifyViewNode {
  readonly artist: Item;

  constructor(artist: Item) {
    super('SpotifyArtistView');
    this.artist = artist;
  }

  override title(): string {
    const heads = spotifyCatalog.list('artist/' + idOfUri(this.artist.uri));
    return heads.length > 0 ? heads[0].name : this.artist.name;
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    const left = contentLeftX();
    const width = contentWidthOf(viewWidth);
    const topY = CONTENT_TOP_Y;
    const bottomY = viewHeight - getTouchKeyboardHeight();
    const artistId = idOfUri(this.artist.uri);
    const heads = spotifyCatalog.list('artist/' + artistId);
    const artist = heads.length > 0 ? heads[0] : this.artist;
    const scrollBox = beginViewScroll(topY, bottomY, viewWidth);
    let y = topY + 4 - scrollBox.scrollY;
    drawCoverArt(artist.art, artist.name, left, y, 150, 75);
    drawLabel(Fonts.hero, left + 176, y + 34, artist.name, COLOR_TEXT_PRIMARY, width - 176);
    drawText(Fonts.small, left + 176, y + 78, 'Artiste', COLOR_TEXT_SECONDARY, 255, 0);
    const playWidth = drawPillButton('sp/a/play', left + 176, y + 106, 'Lire', 0x000000, COLOR_GREEN, () => playSpotifyItem(artist), 'audio-lines');
    drawPillButton('sp/a/radio', left + 176 + playWidth + 12, y + 106, "Radio de l'artiste", COLOR_TEXT_PRIMARY, COLOR_FILL, () => playSpotifyRadio(artist), 'radio');
    y += 180;

    const songsKey = 'songs/' + artist.name;
    const songs = spotifyCatalog.list(songsKey);
    drawText(Fonts.heading, left, y, 'Titres', COLOR_TEXT_PRIMARY, 255, 0);
    y += 36;
    if (drawListStatus(songsKey, left, y - 30, width)) {
      const songCount = Math.min(5, songs.length) as i32;
      for (let index: i32 = 0; index < songCount; index++) {
        drawSongRow(songs[index], 'sp/as/' + index, left, y, width, false, index, ROW_HEIGHT);
        y += ROW_HEIGHT;
      }
    } else {
      y += 120;
    }
    y += 24;

    const albumsKey = 'albums/' + artistId;
    const albums = spotifyCatalog.list(albumsKey);
    drawText(Fonts.heading, left, y, 'Albums et singles', COLOR_TEXT_PRIMARY, 255, 0);
    y += 40;
    if (drawListStatus(albumsKey, left, y - 30, width)) {
      const tileSize = (width - GRID_GAP_X * (GRID_COLUMN_COUNT - 1)) / GRID_COLUMN_COUNT;
      for (let index = 0; index < albums.length; index++) {
        const tileY = y + Math.floor(index / GRID_COLUMN_COUNT) * (tileSize + 62);
        if (tileY < bottomY && tileY + tileSize + 62 > topY) {
          drawTile(albums[index], 'sp/aa/' + index, left + (index % GRID_COLUMN_COUNT) * (tileSize + GRID_GAP_X), tileY, tileSize);
        }
      }
      y += Math.ceil(albums.length / GRID_COLUMN_COUNT) * (tileSize + 62);
      y = drawNextPageSpinner(albumsKey, left, y, width, y < bottomY + 200);
    }
    scrollBox.contentHeight = y + scrollBox.scrollY - topY + 24;
    endScrollBox();
  }
}

/** An album's or a playlist's page: its head, then its songs. */
class CollectionViewNode extends SpotifyViewNode {
  readonly kind: string;
  readonly collection: Item;
  readonly key: string;

  constructor(kind: string, collection: Item) {
    super('SpotifyCollectionView');
    this.kind = kind;
    this.collection = collection;
    this.key = `${kind}/${idOfUri(collection.uri)}`;
  }

  override title(): string {
    if (this.collection.name !== '') return this.collection.name;
    const all = spotifyCatalog.list(this.key); // opened from a song's menu: the name comes with the page
    return all.length > 0 ? all[0].name : '';
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    const left = contentLeftX();
    const width = contentWidthOf(viewWidth);
    const topY = CONTENT_TOP_Y;
    const bottomY = viewHeight - getTouchKeyboardHeight();
    const all = spotifyCatalog.list(this.key);
    const head = all.length > 0 ? all[0] : this.collection;
    const songCount = all.length > 1 ? all.length - 1 : 0;
    const scrollBox = beginViewScroll(topY, bottomY, viewWidth);
    let y = topY + 4 - scrollBox.scrollY;
    drawCoverArt(head.art, head.name, left, y, 170, 10);
    drawText(Fonts.tinyBold, left + 196, y + 20, this.kind === 'album' ? 'ALBUM' : 'PLAYLIST', COLOR_TEXT_SECONDARY, 255, 0);
    drawWrappedText(Fonts.hero, left + 196, y + 40, head.name, COLOR_TEXT_PRIMARY, width - 196, 2, 40);
    let byLine = head.subtitle;
    if (head.year !== '') byLine += ' · ' + head.year;
    if (songCount > 0) byLine += ` · ${songCount}${spotifyCatalog.hasMore(this.key) ? '+' : ''} titres`;
    drawLabel(Fonts.small, left + 196, y + 124, byLine, COLOR_TEXT_SECONDARY, width - 196);
    if (this.kind === 'album' && head.artistId !== '') {
      registerTapZone('sp/c/artist', left + 196, y + 118, Math.min(width - 196, textWidth(Fonts.small, head.subtitle, 0) + 10), 28, () =>
        spotifyBrowser.open('artist', artistOf(head))
      );
    }
    drawPillButton('sp/c/play', left + 196, y + 150, 'Lire', 0x000000, COLOR_GREEN, () => playSpotifyItem(head), 'audio-lines');
    y += 196;
    if (!drawListStatus(this.key, left, y, width)) {
      endScrollBox();
      return;
    }
    if (songCount === 0 && this.kind === 'playlist') {
      // a playlist of someone else: Spotify gives its songs to the speakers only
      drawWrappedText(
        Fonts.label,
        left,
        y + 20,
        'Spotify ne montre pas le contenu des playlists des autres aux apps comme celle-ci : « Lire » la joue en entier sur les enceintes.',
        COLOR_TEXT_SECONDARY,
        width,
        3,
        28
      );
    }
    for (let index: i32 = 0; index < songCount; index++) {
      const rowY = y + index * ROW_HEIGHT;
      if (rowY < bottomY && rowY + ROW_HEIGHT > topY) {
        drawSongRow(all[index + 1], 'sp/c/' + index, left, rowY, width, this.kind === 'album', index, ROW_HEIGHT);
      }
    }
    y += songCount * ROW_HEIGHT;
    y = drawNextPageSpinner(this.key, left, y, width, y < bottomY + 300);
    scrollBox.contentHeight = y + scrollBox.scrollY - topY + 24;
    endScrollBox();
  }
}

export const spotifyBrowser = new SpotifyBrowser();
