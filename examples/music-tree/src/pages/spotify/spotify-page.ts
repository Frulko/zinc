// ============================================================================
// pages/spotify/spotify-page.ts — Page Bibliothèque et Recherche Spotify
// ============================================================================
// Construite avec l'arbre `DisplayObject` et ses composants Flexbox :
// - `headerBar` (`PageHeaderBarNode` : titre + `SpacerNode(1)` + 5 onglets)
// - `disconnectedCard` (`CardBox` : instructions de connexion si non connecté)
// - `loginCard` (`CardBox`: on a Mac, the login from the app, or why it cannot)
// - `searchFieldNode` (`SearchFieldNode`)
// - `keyboardNode` (`VirtualKeyboardNode`)

import { rrect, drawText } from 'zinc:gfx';
import { Item } from 'zinc:spotify';
import {
  COLOR_ACCENT,
  COLOR_CARD_ELEVATED,
  COLOR_GREEN,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_TERTIARY,
  GRID_COLUMNS,
  GRID_GAP,
  KEYBOARD_HEIGHT,
  LIST_ROW_HEIGHT,
  PAGE_PADDING,
  PAGE_SPOTIFY,
} from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import {
  ScrollBox,
  beginScrollBox,
  endScrollBox,
  isZonePressed,
  registerTapZone,
} from '../../core/input';
import {
  drawGlyph,
  drawLabel,
  drawSeparatorLine,
  drawWrappedText,
} from '../../components/primitives';
import { drawActivitySpinner } from '../../components/slider';
import {
  drawCoverArt,
  drawLoadingSkeleton,
  drawMediaTile,
} from '../../components/cover';
import { VirtualKeyboardNode } from '../../components/keyboard';
import {
  CardBox,
  HBox,
  IconNode,
  LabelNode,
  PageHeaderBarNode,
  PillButtonNode,
  SpinnerNode,
  SearchFieldNode,
  SegmentedControlNode,
} from '../../components/layout-nodes';
import {
  appState,
  loadMoreSpotifyItems,
  loadSpotifyTab,
  playSpotifyItem,
} from '../../state';
import {
  canLogInFromThisDevice,
  cancelSpotifyLogin,
  getSpotifyLoginClientId,
  getSpotifyLoginError,
  isSpotifyLoginWaiting,
  startSpotifyLogin,
} from '../../services/spotify-account';

const SPOTIFY_TAB_LABELS: string[] = [
  'Playlists',
  'Albums',
  'Titres likés',
  'Récents',
  'Rechercher',
];

export class SpotifyPageNode extends DisplayObject {
  readonly headerBar: PageHeaderBarNode;
  readonly tabsSegmentedNode: SegmentedControlNode;
  readonly disconnectedCard: CardBox;
  readonly disconnectedHeadingLabel: LabelNode;
  readonly disconnectedLeadLabel: LabelNode;
  readonly loginCard: CardBox;
  readonly loginIconNode: IconNode;
  readonly loginHeadingLabel: LabelNode;
  readonly loginLeadLabel: LabelNode;
  readonly loginActionsRow: HBox;
  readonly loginButton: PillButtonNode;
  readonly loginSpinner: SpinnerNode;
  readonly loginCancelButton: PillButtonNode;
  readonly searchFieldNode: SearchFieldNode;
  readonly keyboardNode: VirtualKeyboardNode;

  constructor() {
    super('SpotifyPage');

    // Barre d'en-tête Flexbox
    this.headerBar = new PageHeaderBarNode('Spotify', 14);
    this.tabsSegmentedNode = new SegmentedControlNode(
      'sp/tab',
      SPOTIFY_TAB_LABELS,
      (selectedTab: i32) => {
        appState.activeSpotifyTab = selectedTab;
        appState.isKeyboardVisible = selectedTab === 4 && appState.searchQuery === '';
        appState.pageScrollBoxes[PAGE_SPOTIFY].scrollY = 0;
        if (selectedTab < 4) {
          loadSpotifyTab(selectedTab, false);
        }
      },
      112
    );
    this.headerBar.addChild(this.tabsSegmentedNode);

    // Carte d'instructions Flexbox affichée lorsque Spotify n'est pas connecté
    this.disconnectedCard = new CardBox('column', 250, 'SpotifySetupCard');
    this.disconnectedCard.y = 110;
    this.disconnectedCard.setPaddingSymmetric(24, 24);
    this.disconnectedCard.gap = 12;

    const cardHeaderRow = new HBox(16, 'SetupHeaderRow');
    cardHeaderRow.height = 36;
    cardHeaderRow.autoHeight = false;
    cardHeaderRow.addChild(new IconNode('library', 32, COLOR_GREEN));
    this.disconnectedHeadingLabel = new LabelNode(
      Fonts.heading,
      "Spotify n'est pas connecté",
      COLOR_TEXT_PRIMARY,
      32
    );
    cardHeaderRow.addChild(this.disconnectedHeadingLabel);
    this.disconnectedCard.addChild(cardHeaderRow);

    this.disconnectedLeadLabel = new LabelNode(
      Fonts.small,
      'Une seule connexion, faite depuis un ordinateur :',
      COLOR_TEXT_PRIMARY,
      24
    );
    this.disconnectedCard.addChild(this.disconnectedLeadLabel);
    this.disconnectedCard.addChild(
      new LabelNode(
        Fonts.small,
        '1. developer.spotify.com/dashboard : une app, redirect http://127.0.0.1:8765/callback',
        COLOR_TEXT_SECONDARY,
        24
      )
    );
    this.disconnectedCard.addChild(
      new LabelNode(
        Fonts.small,
        '2. python3 plugins/spotify/login.py <CLIENT_ID> (écrit ~/.zinc/spotify.json, partagé)',
        COLOR_TEXT_SECONDARY,
        24
      )
    );
    this.disconnectedCard.addChild(
      new LabelNode(
        Fonts.small,
        '3. Les apps du Mac le lisent ; install.sh le copie sur la tablette.',
        COLOR_TEXT_SECONDARY,
        24
      )
    );

    // On a Mac (a browser at hand): the login from the app, or why this build cannot log in
    this.loginCard = new CardBox('column', 180, 'SpotifyLoginCard');
    this.loginCard.y = 110;
    this.loginCard.setPaddingSymmetric(24, 24);
    this.loginCard.gap = 12;
    const loginHeaderRow = new HBox(16, 'LoginHeaderRow');
    loginHeaderRow.height = 36;
    loginHeaderRow.autoHeight = false;
    this.loginIconNode = new IconNode('library', 32, COLOR_GREEN);
    this.loginHeadingLabel = new LabelNode(Fonts.heading, '', COLOR_TEXT_PRIMARY, 32);
    loginHeaderRow.addChild(this.loginIconNode);
    loginHeaderRow.addChild(this.loginHeadingLabel);
    this.loginCard.addChild(loginHeaderRow);
    this.loginLeadLabel = new LabelNode(Fonts.small, '', COLOR_TEXT_SECONDARY, 24);
    this.loginCard.addChild(this.loginLeadLabel);
    this.loginActionsRow = new HBox(14, 'LoginActionsRow');
    this.loginActionsRow.height = 48;
    this.loginActionsRow.alignItems = 'center';
    this.loginButton = new PillButtonNode('sp/login', 'Se connecter à Spotify', 'library', startSpotifyLogin, 44);
    this.loginButton.foregroundColor = 0x000000;
    this.loginButton.backgroundColor = COLOR_GREEN;
    this.loginSpinner = new SpinnerNode(12);
    this.loginCancelButton = new PillButtonNode('sp/login/cancel', 'Annuler', '', cancelSpotifyLogin);
    this.loginActionsRow.addChild(this.loginButton);
    this.loginActionsRow.addChild(this.loginSpinner);
    this.loginActionsRow.addChild(this.loginCancelButton);
    this.loginCard.addChild(this.loginActionsRow);

    // Champ de recherche (onglet Rechercher)
    this.searchFieldNode = new SearchFieldNode(
      'Titres, artistes, albums, playlists',
      () => {
        appState.isKeyboardVisible = true;
      },
      () => {
        appState.searchQuery = '';
      }
    );
    this.searchFieldNode.y = 100;

    // Clavier virtuel AZERTY
    this.keyboardNode = new VirtualKeyboardNode();

    this.addChild(this.headerBar);
    this.addChild(this.disconnectedCard);
    this.addChild(this.loginCard);
    this.addChild(this.searchFieldNode);
    this.addChild(this.keyboardNode);
  }

  override onAddedToStage(): void {
    loadSpotifyTab(appState.activeSpotifyTab, false);
  }

  override onMeasure(): void {
    const sidebarWidth = appState.sidebarWidth;
    const pageWidth = this.width > 0 ? this.width : 1024;
    const isConnected = appState.spotifyClient.ready();

    this.headerBar.x = sidebarWidth;
    this.headerBar.width = pageWidth - sidebarWidth;
    this.headerBar.setPaddingSymmetric(PAGE_PADDING, 0);

    this.tabsSegmentedNode.visible = isConnected;
    this.tabsSegmentedNode.selectedIndex = appState.activeSpotifyTab;

    this.disconnectedCard.visible = !isConnected && !canLogInFromThisDevice;
    this.disconnectedCard.x = sidebarWidth + PAGE_PADDING;
    this.disconnectedCard.width = pageWidth - sidebarWidth - PAGE_PADDING * 2;
    this.loginCard.visible = !isConnected && canLogInFromThisDevice;
    this.loginCard.x = this.disconnectedCard.x;
    this.loginCard.width = this.disconnectedCard.width;
    if (this.loginCard.visible) {
      this.measureLoginCard();
    } else if (!isConnected) {
      const isExpired = appState.spotifyClient.problem === 'login expired';
      this.disconnectedHeadingLabel.text = isExpired
        ? 'La connexion Spotify a expiré'
        : "Spotify n'est pas connecté";
      this.disconnectedLeadLabel.text = isExpired
        ? 'Spotify demande de se reconnecter tous les six mois.'
        : 'Une seule connexion, faite depuis un ordinateur :';
    }

    this.searchFieldNode.visible = isConnected && appState.activeSpotifyTab === 4;
    this.searchFieldNode.x = sidebarWidth + PAGE_PADDING;
    this.searchFieldNode.width = pageWidth - sidebarWidth - PAGE_PADDING * 2;
    this.searchFieldNode.currentText = appState.searchQuery;
    this.searchFieldNode.isTypingActive = appState.isKeyboardVisible;

    this.keyboardNode.visible = isConnected && appState.isKeyboardVisible;
  }

  private measureLoginCard(): void {
    const hasClientId = getSpotifyLoginClientId() !== '';
    const isExpired = appState.spotifyClient.problem === 'login expired';
    const isWaiting = isSpotifyLoginWaiting();
    const loginError = getSpotifyLoginError();
    this.loginIconNode.color = hasClientId ? COLOR_GREEN : COLOR_TEXT_TERTIARY;
    this.loginHeadingLabel.text = !hasClientId
      ? "Spotify n'est pas disponible"
      : isExpired
      ? 'La connexion Spotify a expiré'
      : "Spotify n'est pas connecté";
    // a build without a client id (src/spotify-client.ts): nothing a person can do from the app
    this.loginLeadLabel.text = !hasClientId
      ? "Cette version n'a pas d'identifiant d'app Spotify : demande une version qui en a un."
      : isWaiting
      ? "Termine la connexion dans le navigateur qui vient de s'ouvrir."
      : loginError !== ''
      ? `La connexion n'a pas abouti (${loginError}) : réessaie.`
      : isExpired
      ? 'Spotify demande de se reconnecter tous les six mois.'
      : 'Une connexion pour toutes les apps de ce Mac.';
    this.loginLeadLabel.color =
      hasClientId && (isWaiting || loginError !== '') ? COLOR_TEXT_PRIMARY : COLOR_TEXT_SECONDARY;
    this.loginActionsRow.visible = hasClientId;
    this.loginButton.visible = !isWaiting;
    this.loginSpinner.visible = isWaiting;
    this.loginCancelButton.visible = isWaiting;
    this.loginCard.height = hasClientId ? 180 : 132;
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    if (!appState.spotifyClient.ready()) return;

    const sidebarWidth = appState.sidebarWidth;
    const contentBottomY =
      viewHeight - (appState.isKeyboardVisible ? KEYBOARD_HEIGHT : 0);
    const listTopY = appState.activeSpotifyTab === 4 ? 166 : 100;

    const currentTabState = appState.spotifyTabStates[appState.activeSpotifyTab];
    const spotifyScrollBox = appState.pageScrollBoxes[PAGE_SPOTIFY];

    if (currentTabState === 'loading') {
      drawLoadingSkeleton(
        appState.activeSpotifyTab <= 1,
        listTopY,
        contentBottomY,
        viewWidth,
        sidebarWidth
      );
    } else if (currentTabState !== '' && currentTabState !== 'ok') {
      // an error can be long: wrapped, not cut at the edges
      drawWrappedText(
        Fonts.label,
        sidebarWidth + PAGE_PADDING,
        listTopY + 80,
        currentTabState,
        COLOR_TEXT_SECONDARY,
        viewWidth - sidebarWidth - PAGE_PADDING * 2,
        3,
        30
      );
    } else if (appState.activeSpotifyTab <= 1) {
      this.drawSpotifyTileGrid(
        appState.spotifyTabLists[appState.activeSpotifyTab],
        listTopY,
        contentBottomY,
        viewWidth,
        spotifyScrollBox,
        appState.spotifyTabHasMore[appState.activeSpotifyTab]
      );
    } else {
      this.drawSpotifyItemRows(
        appState.spotifyTabLists[appState.activeSpotifyTab],
        listTopY,
        contentBottomY,
        viewWidth,
        spotifyScrollBox,
        appState.activeSpotifyTab === 2 ? 'Lire tous les titres likés' : '',
        appState.spotifyTabHasMore[appState.activeSpotifyTab]
      );
    }

    if (
      currentTabState === 'ok' &&
      spotifyScrollBox.scrollY + spotifyScrollBox.viewportHeight >
        spotifyScrollBox.contentHeight - 600
    ) {
      loadMoreSpotifyItems(appState.activeSpotifyTab);
    }
  }

  private drawSpotifyTileGrid(
    itemsList: Item[],
    topY: number,
    bottomY: number,
    viewWidth: number,
    scrollBox: ScrollBox,
    hasMorePages: boolean
  ): void {
    const sidebarWidth = appState.sidebarWidth;
    const contentStartX = sidebarWidth + PAGE_PADDING;
    const contentWidth = viewWidth - sidebarWidth - PAGE_PADDING * 2;
    const tileSize = (contentWidth - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
    const rowHeight = tileSize + 62;

    beginScrollBox(
      scrollBox,
      sidebarWidth,
      topY,
      viewWidth - sidebarWidth,
      bottomY - topY
    );
    const totalRows = Math.ceil(itemsList.length / GRID_COLUMNS);
    scrollBox.contentHeight =
      totalRows * rowHeight + 24 + (hasMorePages ? 72 : 0);

    if (hasMorePages) {
      drawActivitySpinner(
        sidebarWidth + (viewWidth - sidebarWidth) / 2,
        topY + totalRows * rowHeight + 36 - scrollBox.scrollY,
        14
      );
    }

    for (let index = 0; index < itemsList.length; index++) {
      const item = itemsList[index];
      const columnIndex = index % GRID_COLUMNS;
      const rowIndex = Math.floor(index / GRID_COLUMNS);
      const tileX = contentStartX + columnIndex * (tileSize + GRID_GAP);
      const tileY = topY + 8 + rowIndex * rowHeight - scrollBox.scrollY;
      if (tileY > bottomY || tileY + rowHeight < topY) continue;

      drawMediaTile(
        'sp/' + index,
        tileX,
        tileY,
        tileSize,
        item.art,
        item.name,
        item.subtitle,
        false,
        false,
        () => playSpotifyItem(item)
      );
    }

    endScrollBox();
  }

  private drawSpotifyItemRows(
    itemsList: Item[],
    topY: number,
    bottomY: number,
    viewWidth: number,
    scrollBox: ScrollBox,
    headerActionLabel: string,
    hasMorePages: boolean
  ): void {
    const sidebarWidth = appState.sidebarWidth;
    const contentStartX = sidebarWidth + PAGE_PADDING;
    const contentWidth = viewWidth - sidebarWidth - PAGE_PADDING * 2;

    beginScrollBox(
      scrollBox,
      sidebarWidth,
      topY,
      viewWidth - sidebarWidth,
      bottomY - topY
    );
    const headerRowCount = headerActionLabel !== '' ? 1 : 0;
    scrollBox.contentHeight =
      (itemsList.length + headerRowCount) * LIST_ROW_HEIGHT +
      24 +
      (hasMorePages ? 72 : 0);

    if (hasMorePages) {
      drawActivitySpinner(
        sidebarWidth + (viewWidth - sidebarWidth) / 2,
        topY +
          (itemsList.length + headerRowCount) * LIST_ROW_HEIGHT +
          36 -
          scrollBox.scrollY,
        14
      );
    }

    if (headerActionLabel !== '') {
      const headerRowY = topY - scrollBox.scrollY;
      const headerZoneId = 'rows/head';
      if (isZonePressed(headerZoneId)) {
        rrect(
          contentStartX - 10,
          headerRowY,
          contentWidth + 20,
          LIST_ROW_HEIGHT,
          10,
          COLOR_CARD_ELEVATED,
          255
        );
      }
      rrect(contentStartX, headerRowY + 10, 48, 48, 8, COLOR_ACCENT, 255);
      drawGlyph('heart', contentStartX + 12, headerRowY + 22, 24, COLOR_TEXT_PRIMARY);
      drawText(
        Fonts.bodyBold,
        contentStartX + 64,
        headerRowY + 22,
        headerActionLabel,
        COLOR_TEXT_PRIMARY,
        255,
        0
      );
      const likedCollectionItem = new Item();
      likedCollectionItem.kind = 'liked';
      likedCollectionItem.name = 'Titres likés';
      registerTapZone(
        headerZoneId,
        contentStartX,
        headerRowY,
        contentWidth,
        LIST_ROW_HEIGHT,
        () => playSpotifyItem(likedCollectionItem)
      );
    }

    for (let index = 0; index < itemsList.length; index++) {
      const item = itemsList[index];
      const rowY =
        topY + (index + headerRowCount) * LIST_ROW_HEIGHT - scrollBox.scrollY;
      if (rowY > bottomY || rowY + LIST_ROW_HEIGHT < topY) continue;

      const rowZoneId = 'rows/' + index;
      if (isZonePressed(rowZoneId)) {
        rrect(
          contentStartX - 10,
          rowY,
          contentWidth + 20,
          LIST_ROW_HEIGHT,
          10,
          COLOR_CARD_ELEVATED,
          255
        );
      }

      const thumbUrl = item.thumb !== '' ? item.thumb : item.art;
      drawCoverArt(
        thumbUrl,
        item.name,
        contentStartX,
        rowY + 10,
        48,
        item.kind === 'artist' ? 24 : 6
      );
      drawLabel(
        Fonts.label,
        contentStartX + 64,
        rowY + 13,
        item.name,
        COLOR_TEXT_PRIMARY,
        contentWidth - 200
      );

      const kindLabel =
        item.kind === 'track'
          ? 'Titre'
          : item.kind === 'playlist'
          ? 'Playlist'
          : item.kind === 'album'
          ? 'Album'
          : item.kind === 'artist'
          ? 'Artiste'
          : 'Épisode';
      const subtitleText =
        kindLabel + (item.subtitle !== '' ? ' · ' + item.subtitle : '');
      drawLabel(
        Fonts.small,
        contentStartX + 64,
        rowY + 38,
        subtitleText,
        COLOR_TEXT_SECONDARY,
        contentWidth - 200
      );

      if (index < itemsList.length - 1) {
        drawSeparatorLine(
          contentStartX + 64,
          rowY + LIST_ROW_HEIGHT - 1,
          contentWidth - 64
        );
      }
      registerTapZone(
        rowZoneId,
        contentStartX,
        rowY,
        contentWidth,
        LIST_ROW_HEIGHT,
        () => playSpotifyItem(item)
      );
    }

    endScrollBox();
  }
}
