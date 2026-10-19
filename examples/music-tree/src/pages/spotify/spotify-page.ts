// ============================================================================
// pages/spotify/spotify-page.ts — The Spotify page
// ============================================================================
// Built once with the display tree:
// - `headerBar` (an `HBox`: the back button, the title of the view on top)
// - `disconnectedCard` (`CardBox`: how to log in from a computer, on a tablet)
// - `loginCard` (`CardBox`: on a Mac, the login from the app, or why it cannot)
// - `spotifyBrowser.viewHost` (the view on top: library, search, artist, album, playlist; spotify-views.ts)
// - `songMenuNode` (a song's actions) and `keyboardNode` (`VirtualKeyboardNode`, a tablet's)

import {
  COLOR_FILL,
  COLOR_GREEN,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_TERTIARY,
  PAGE_PADDING,
} from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { VirtualKeyboardNode } from '../../components/keyboard';
import {
  CardBox,
  HBox,
  IconButtonNode,
  IconNode,
  LabelNode,
  PillButtonNode,
  SpinnerNode,
} from '../../components/layout-nodes';
import { appState } from '../../state';
import { spotifyCatalog } from '../../services/spotify-catalog';
import {
  canLogInFromThisDevice,
  cancelSpotifyLogin,
  getSpotifyLoginClientId,
  getSpotifyLoginError,
  isSpotifyLoginWaiting,
  startSpotifyLogin,
} from '../../services/spotify-account';
import { spotifyBrowser } from './spotify-views';
import { SongMenuNode, spotifyNavigation } from './spotify-pieces';

export class SpotifyPageNode extends DisplayObject {
  readonly headerBar: HBox;
  readonly backButton: IconButtonNode;
  readonly titleLabel: LabelNode;
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
  readonly songMenuNode: SongMenuNode;
  readonly keyboardNode: VirtualKeyboardNode;

  constructor() {
    super('SpotifyPage');

    // The header: the back button (a view over the library) and the title of the view on top
    this.headerBar = new HBox(16, 'SpotifyHeader');
    this.headerBar.y = 30;
    this.headerBar.height = 48;
    this.headerBar.autoHeight = false;
    this.backButton = new IconButtonNode('sp/back', 'chevron-left', 28, COLOR_TEXT_PRIMARY, () => spotifyBrowser.back(), 48);
    this.backButton.backgroundColor = COLOR_FILL;
    this.backButton.backgroundAlpha = 255;
    this.titleLabel = new LabelNode(Fonts.hero, 'Spotify', COLOR_TEXT_PRIMARY, 40);
    this.titleLabel.flex = 1;
    this.headerBar.addChild(this.backButton);
    this.headerBar.addChild(this.titleLabel);

    // Flexbox instruction card shown when Spotify is not connected
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

    this.songMenuNode = new SongMenuNode();
    this.keyboardNode = new VirtualKeyboardNode();

    this.addChild(this.headerBar);
    this.addChild(this.disconnectedCard);
    this.addChild(this.loginCard);
    this.addChild(spotifyBrowser.viewHost);
    this.addChild(this.songMenuNode);
    this.addChild(this.keyboardNode);
  }

  /** Each frame while the page is shown: the search field's words (a search once the typing pauses), a reset of the account. */
  override onUpdate(deltaSeconds: number): void {
    if (!appState.spotifyClient.ready()) return;
    spotifyBrowser.followCatalog();
    if (spotifyBrowser.isSearching()) spotifyCatalog.tick(appState.searchQuery);
  }

  override onMeasure(): void {
    const sidebarWidth = appState.sidebarWidth;
    const pageWidth = this.width > 0 ? this.width : 1024;
    const pageHeight = this.height > 0 ? this.height : 738;
    const isConnected = appState.spotifyClient.ready();

    this.headerBar.x = sidebarWidth + PAGE_PADDING;
    this.headerBar.width = pageWidth - sidebarWidth - PAGE_PADDING * 2;
    this.backButton.visible = isConnected && spotifyBrowser.canGoBack();
    this.titleLabel.text = isConnected ? spotifyBrowser.top().title() : 'Spotify';

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

    const topView = spotifyBrowser.top();
    spotifyBrowser.viewHost.visible = isConnected;
    topView.width = pageWidth;
    topView.height = pageHeight;
    this.songMenuNode.visible = isConnected && spotifyNavigation.menuSong !== null;
    this.keyboardNode.visible = isConnected && spotifyBrowser.isSearching();
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
}
