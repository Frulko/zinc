// ============================================================================
// pages/settings/settings-page.ts — Settings page (built as a Flexbox tree)
// ============================================================================
// This page shows how to use the light Flexbox layout engine built into
// `DisplayObject` (`VBox`, `HBox`, `CardBox`, `ScrollContainerNode`,
// `LabelNode`, `IconNode`, `PillButtonNode`, `SegmentedControlNode`).
//
// The whole hierarchy of cards, icons, texts and buttons is assembled once
// in the `constructor()` with `addChild()`. At render time, the
// layout engine computes the positions and flexible widths automatically
// (`flex = 1`), with no manual `x` or `y` coordinate computation!

import { System } from 'zinc:sonos';
import {
  COLOR_DANGER,
  COLOR_FILL,
  COLOR_GREEN,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_TERTIARY,
  PAGE_PADDING,
  PAGE_SETTINGS,
} from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { drawPageHeader } from '../../components/primitives';
import {
  CardBox,
  HBox,
  IconNode,
  LabelNode,
  PillButtonNode,
  ScrollContainerNode,
  SegmentedControlNode,
  SeparatorNode,
  SpinnerNode,
  VBox,
} from '../../components/layout-nodes';
import {
  askOrConfirmSpotifyLogout,
  checkSpotifyAccount,
  isCheckingSpotify,
  spotifyCheckText,
  spotifyLogoutConfirmSeconds,
} from '../../services/spotify-account';
import { setNotificationsShown } from '../../services/notify-service';
import { saveAppConfig } from '../../services/config';
import {
  getWeatherCityName,
  triggerPlaceSearch,
} from '../../services/weather-service';
import {
  appState,
  discoverSonosSystem,
  formatPlural,
} from '../../state';
import { CitySearchSubpageNode } from './city-search-page';

const SLEEP_DELAY_OPTIONS_SECONDS: number[] = [30, 60, 120, 300, 600, 0];
const SLEEP_DELAY_LABELS: string[] = [
  '30 s',
  '1 min',
  '2 min',
  '5 min',
  '10 min',
  'Jamais',
];

/** Creates a small section title in grey capitals (e.g. 'ÉCRAN', 'MÉTÉO'). */
function createSectionHeader(title: string): HBox {
  const row = new HBox(0, `SectionHeader_${title}`);
  row.height = 16;
  row.paddingLeft = 4;
  row.addChild(new LabelNode(Fonts.tinyBold, title, COLOR_TEXT_SECONDARY, 16));
  return row;
}

export class SettingsPageNode extends DisplayObject {
  readonly scrollContainer: ScrollContainerNode;
  readonly citySearchSubpage: CitySearchSubpageNode;

  // References to the dynamic nodes updated in onMeasure()
  private readonly sleepSegmentedControl: SegmentedControlNode;
  private readonly glancesSegmented: SegmentedControlNode;
  private readonly notificationsIconNode: IconNode;
  private readonly notificationsLabel: LabelNode;
  private readonly notificationsSegmented: SegmentedControlNode;
  private readonly batteryIconNode: IconNode;
  private readonly batteryVisibilitySegmented: SegmentedControlNode;
  private readonly batteryPercentSegmented: SegmentedControlNode;
  private readonly weatherCityLabel: LabelNode;
  private readonly spotifyIconNode: IconNode;
  private readonly spotifyStatusLabel: LabelNode;
  private readonly spotifyCard: CardBox;
  private readonly spotifyCheckButton: PillButtonNode;
  private readonly spotifyCheckSpinner: SpinnerNode;
  private readonly spotifyLogoutButton: PillButtonNode;
  private readonly spotifyCheckResultRow: HBox;
  private readonly spotifyCheckResultLabel: LabelNode;
  private readonly sonosIconNode: IconNode;
  private readonly sonosStatusLabel: LabelNode;

  constructor() {
    super('SettingsPage');

    // Vertical scroll container holding a VBox with gap = 24 px between sections
    this.scrollContainer = new ScrollContainerNode(
      appState.pageScrollBoxes[PAGE_SETTINGS],
      24,
      'SettingsScroll'
    );
    this.scrollContainer.y = 96;
    this.scrollContainer.contentBox.setPaddingSymmetric(PAGE_PADDING, 8);
    this.scrollContainer.contentBox.paddingBottom = 32;

    // ---- 1. SCREEN section ----
    const screenSection = new VBox(8, 'ScreenSection');
    screenSection.addChild(createSectionHeader('ÉCRAN'));

    const screenCard = new CardBox('column', 120, 'ScreenCard');
    screenCard.setPaddingSymmetric(20, 18);
    screenCard.gap = 18;
    screenCard.addChild(
      new LabelNode(
        Fonts.label,
        "Éteindre l'écran sans contact après",
        COLOR_TEXT_PRIMARY,
        22
      )
    );
    this.sleepSegmentedControl = new SegmentedControlNode(
      'set/sleep',
      SLEEP_DELAY_LABELS,
      (chosenIndex: i32) => {
        appState.config.sleepDelaySeconds = SLEEP_DELAY_OPTIONS_SECONDS[chosenIndex];
        appState.screenPower.delaySeconds = appState.config.sleepDelaySeconds;
        saveAppConfig(appState.config);
      }
    );
    screenCard.addChild(this.sleepSegmentedControl);
    screenCard.addChild(new SeparatorNode());
    const glancesRow = new HBox(14, 'GlancesRow');
    const glancesLabel = new LabelNode(Fonts.label, "Réveil automatique sur l'horloge", COLOR_TEXT_PRIMARY, 22);
    glancesLabel.flex = 1;
    this.glancesSegmented = new SegmentedControlNode(
      'set/glances',
      ['Activé', 'Désactivé'],
      (chosenIndex: i32) => {
        appState.config.clockGlancesEnabled = chosenIndex === 0;
        appState.screenPower.glancesEnabled = appState.config.clockGlancesEnabled;
        saveAppConfig(appState.config);
      }
    );
    glancesRow.addChild(glancesLabel);
    glancesRow.addChild(this.glancesSegmented);
    screenCard.addChild(glancesRow);
    screenCard.autoHeight = true;
    screenSection.addChild(screenCard);
    this.scrollContainer.contentBox.addChild(screenSection);

    // ---- MAC NOTIFICATIONS section ----
    const notificationsSection = new VBox(8, 'NotificationsSection');
    notificationsSection.addChild(createSectionHeader('NOTIFICATIONS DU MAC'));
    const notificationsCard = new CardBox('row', 64, 'NotificationsCard');
    notificationsCard.setPaddingSymmetric(20, 0);
    notificationsCard.gap = 14;
    this.notificationsIconNode = new IconNode('bell', 24, COLOR_TEXT_SECONDARY);
    this.notificationsLabel = new LabelNode(Fonts.label, '', COLOR_TEXT_PRIMARY, 24);
    this.notificationsLabel.flex = 1;
    this.notificationsSegmented = new SegmentedControlNode(
      'set/notify',
      ['Activées', 'Désactivées'],
      (chosenIndex: i32) => {
        appState.config.macNotificationsShown = chosenIndex === 0;
        setNotificationsShown(appState.config.macNotificationsShown);
        saveAppConfig(appState.config);
      }
    );
    notificationsCard.addChild(this.notificationsIconNode);
    notificationsCard.addChild(this.notificationsLabel);
    notificationsCard.addChild(this.notificationsSegmented);
    notificationsSection.addChild(notificationsCard);
    this.scrollContainer.contentBox.addChild(notificationsSection);

    // ---- 2. BATTERY section ----
    const batterySection = new VBox(8, 'BatterySection');
    batterySection.addChild(createSectionHeader('BATTERIE'));

    const batteryCard = new CardBox('row', 64, 'BatteryCard');
    batteryCard.setPaddingSymmetric(20, 0);
    batteryCard.gap = 16;
    this.batteryIconNode = new IconNode('battery', 24, COLOR_TEXT_SECONDARY);
    this.batteryVisibilitySegmented = new SegmentedControlNode(
      'set/bat',
      ['Affichée', 'Masquée'],
      (chosenIndex: i32) => {
        appState.config.showBatteryIndicator = chosenIndex === 0;
        saveAppConfig(appState.config);
      }
    );
    this.batteryPercentSegmented = new SegmentedControlNode(
      'set/batpct',
      ['Avec le pourcentage', 'Sans'],
      (chosenIndex: i32) => {
        appState.config.showBatteryPercentage = chosenIndex === 0;
        saveAppConfig(appState.config);
      }
    );
    batteryCard.addChild(this.batteryIconNode);
    batteryCard.addChild(this.batteryVisibilitySegmented);
    batteryCard.addChild(this.batteryPercentSegmented);
    batterySection.addChild(batteryCard);
    this.scrollContainer.contentBox.addChild(batterySection);

    // ---- 3. WEATHER section ----
    const weatherSection = new VBox(8, 'WeatherSection');
    weatherSection.addChild(createSectionHeader('MÉTÉO'));

    const weatherCard = new CardBox('row', 64, 'WeatherCard');
    weatherCard.setPaddingSymmetric(20, 0);
    weatherCard.paddingRight = 92;
    weatherCard.gap = 14;
    weatherCard.addChild(new IconNode('cloud-sun', 24, COLOR_TEXT_SECONDARY));
    this.weatherCityLabel = new LabelNode(Fonts.label, '', COLOR_TEXT_PRIMARY, 24);
    this.weatherCityLabel.flex = 1; // Takes all the space between the icon and the button automatically!
    weatherCard.addChild(this.weatherCityLabel);
    weatherCard.addChild(
      new PillButtonNode('set/city', 'Choisir', 'search', () => {
        appState.isSearchingWeatherCity = true;
        appState.weatherCityQuery = '';
        triggerPlaceSearch('');
        appState.isKeyboardVisible = true;
        appState.pageScrollBoxes[PAGE_SETTINGS].scrollY = 0;
      })
    );
    weatherSection.addChild(weatherCard);
    this.scrollContainer.contentBox.addChild(weatherSection);

    // ---- 4. SPOTIFY section ----
    const spotifySection = new VBox(8, 'SpotifySection');
    spotifySection.addChild(createSectionHeader('SPOTIFY'));

    // the account's row ("Vérifier": the login file read again, the profile, the Connect devices; "Déconnecter" asks a second tap),
    // and the check's answer under it
    this.spotifyCard = new CardBox('column', 64, 'SpotifyCard');
    this.spotifyCard.setPaddingSymmetric(20, 0);
    const spotifyRow = new HBox(14, 'SpotifyRow');
    spotifyRow.height = 64;
    spotifyRow.autoHeight = false;
    spotifyRow.alignItems = 'center';
    this.spotifyIconNode = new IconNode('library', 24, COLOR_TEXT_TERTIARY);
    this.spotifyStatusLabel = new LabelNode(Fonts.label, '', COLOR_TEXT_PRIMARY, 24);
    this.spotifyStatusLabel.flex = 1;
    this.spotifyCheckButton = new PillButtonNode('set/sp/check', 'Vérifier', '', () => {
      checkSpotifyAccount();
    });
    this.spotifyCheckSpinner = new SpinnerNode(10);
    this.spotifyLogoutButton = new PillButtonNode('set/sp/logout', 'Déconnecter', '', askOrConfirmSpotifyLogout);
    spotifyRow.addChild(this.spotifyIconNode);
    spotifyRow.addChild(this.spotifyStatusLabel);
    spotifyRow.addChild(this.spotifyCheckButton);
    spotifyRow.addChild(this.spotifyCheckSpinner);
    spotifyRow.addChild(this.spotifyLogoutButton);
    this.spotifyCard.addChild(spotifyRow);
    this.spotifyCheckResultRow = new HBox(0, 'SpotifyCheckResultRow');
    this.spotifyCheckResultRow.height = 24;
    this.spotifyCheckResultRow.paddingLeft = 38; // under the status, past the icon
    this.spotifyCheckResultLabel = new LabelNode(Fonts.small, '', COLOR_TEXT_SECONDARY, 24);
    this.spotifyCheckResultLabel.flex = 1;
    this.spotifyCheckResultRow.addChild(this.spotifyCheckResultLabel);
    this.spotifyCard.addChild(this.spotifyCheckResultRow);
    spotifySection.addChild(this.spotifyCard);
    this.scrollContainer.contentBox.addChild(spotifySection);

    // ---- 5. SONOS section ----
    const sonosSection = new VBox(8, 'SonosSection');
    sonosSection.addChild(createSectionHeader('SONOS'));

    const sonosCard = new CardBox('row', 64, 'SonosCard');
    sonosCard.setPaddingSymmetric(20, 0);
    sonosCard.paddingRight = 64;
    sonosCard.gap = 14;
    this.sonosIconNode = new IconNode('speaker', 24, COLOR_TEXT_TERTIARY);
    this.sonosStatusLabel = new LabelNode(Fonts.label, '', COLOR_TEXT_PRIMARY, 24);
    this.sonosStatusLabel.flex = 1;
    sonosCard.addChild(this.sonosIconNode);
    sonosCard.addChild(this.sonosStatusLabel);
    sonosCard.addChild(
      new PillButtonNode('set/find', 'Rechercher', 'refresh-cw', () => {
        appState.sonosSystem = null;
        appState.activeGroup = null;
        discoverSonosSystem();
      })
    );
    sonosSection.addChild(sonosCard);
    this.scrollContainer.contentBox.addChild(sonosSection);

    // ---- 6. PHYSICAL BUTTONS section ----
    const hardwareButtonsSection = new VBox(8, 'HardwareButtonsSection');
    hardwareButtonsSection.addChild(createSectionHeader('BOUTONS PHYSIQUES'));

    const hardwareButtonsCard = new CardBox('column', 64, 'HardwareButtonsCard');
    hardwareButtonsCard.setPaddingSymmetric(20, 12);
    hardwareButtonsCard.gap = 4;
    hardwareButtonsCard.addChild(
      new LabelNode(
        Fonts.small,
        'Commandes UDP sur le port 7777 : toggle, play, pause, next, prev,',
        COLOR_TEXT_SECONDARY,
        18
      )
    );
    hardwareButtonsCard.addChild(
      new LabelNode(
        Fonts.small,
        'vol+, vol-, radio <n>, wake (un ESP32 ou un téléphone sur le Wi-Fi).',
        COLOR_TEXT_SECONDARY,
        18
      )
    );
    hardwareButtonsSection.addChild(hardwareButtonsCard);
    this.scrollContainer.contentBox.addChild(hardwareButtonsSection);

    // Weather city search sub-page
    this.citySearchSubpage = new CitySearchSubpageNode();

    this.addChild(this.scrollContainer);
    this.addChild(this.citySearchSubpage);
  }

  /**
   * Syncs the dynamic properties of the nodes before the Flexbox engine
   * computes the dimensions and positions of the tree.
   */
  override onMeasure(): void {
    const sidebarWidth = appState.sidebarWidth;
    const pageWidth = this.width > 0 ? this.width : 1024;
    const pageHeight = this.height > 0 ? this.height : 738;

    this.citySearchSubpage.visible = appState.isSearchingWeatherCity;
    this.scrollContainer.visible = !appState.isSearchingWeatherCity;
    if (appState.isSearchingWeatherCity) return;

    this.scrollContainer.x = sidebarWidth;
    this.scrollContainer.y = 96;
    this.scrollContainer.width = pageWidth - sidebarWidth;
    this.scrollContainer.height = pageHeight - 96;

    const cardWidth = pageWidth - sidebarWidth - PAGE_PADDING * 2;

    // 1. Screen off delay
    let selectedSleepIndex: i32 = 2;
    for (let index = 0; index < SLEEP_DELAY_OPTIONS_SECONDS.length; index++) {
      if (SLEEP_DELAY_OPTIONS_SECONDS[index] === appState.config.sleepDelaySeconds) {
        selectedSleepIndex = index as i32;
      }
    }
    this.sleepSegmentedControl.selectedIndex = selectedSleepIndex;
    this.sleepSegmentedControl.fixedSegmentWidth = (cardWidth - 44) / 6;
    this.glancesSegmented.selectedIndex = appState.config.clockGlancesEnabled ? 0 : 1;

    // Notifications of the Mac
    const areNotificationsShown = appState.config.macNotificationsShown;
    this.notificationsIconNode.color = areNotificationsShown ? COLOR_TEXT_SECONDARY : COLOR_TEXT_TERTIARY;
    this.notificationsLabel.text = areNotificationsShown
      ? "Affichées et réveillent l'écran"
      : "Gardées dans la liste, sans s'afficher";
    this.notificationsSegmented.selectedIndex = areNotificationsShown ? 0 : 1;

    // 2. Battery
    this.batteryIconNode.iconName = appState.isBatteryCharging
      ? 'battery-charging'
      : 'battery';
    this.batteryIconNode.color =
      appState.batteryLevelPercent < 0 ? COLOR_TEXT_TERTIARY : COLOR_TEXT_SECONDARY;
    this.batteryVisibilitySegmented.selectedIndex = appState.config.showBatteryIndicator
      ? 0
      : 1;
    this.batteryPercentSegmented.selectedIndex = appState.config.showBatteryPercentage
      ? 0
      : 1;

    // 3. Weather city
    const currentPlaceName = getWeatherCityName();
    const hasCustomCoordinates =
      appState.config.weatherLatitude !== 0 ||
      appState.config.weatherLongitude !== 0;
    this.weatherCityLabel.text =
      currentPlaceName === ''
        ? 'Ville : pas encore trouvée'
        : hasCustomCoordinates
        ? `Ville : ${currentPlaceName}`
        : `Ville : ${currentPlaceName} (d'après la connexion)`;

    // 4. Spotify
    this.spotifyIconNode.color = appState.spotifyClient.ready()
      ? COLOR_GREEN
      : COLOR_TEXT_TERTIARY;
    this.spotifyStatusLabel.text = appState.spotifyClient.ready()
      ? appState.spotifyUserName !== ''
        ? `Connecté : ${appState.spotifyUserName}`
        : 'Connecté'
      : appState.spotifyClient.problem === 'login expired'
      ? 'Connexion expirée : refaire la connexion'
      : 'Non connecté (voir la page Spotify)';
    const client = appState.spotifyClient;
    const isLogoutAsked = spotifyLogoutConfirmSeconds > 0;
    this.spotifyLogoutButton.visible = client.ready() || client.problem === 'login expired';
    this.spotifyLogoutButton.label = isLogoutAsked ? 'Confirmer' : 'Déconnecter';
    this.spotifyLogoutButton.foregroundColor = isLogoutAsked ? 0xffffff : COLOR_TEXT_PRIMARY;
    this.spotifyLogoutButton.backgroundColor = isLogoutAsked ? COLOR_DANGER : COLOR_FILL;
    this.spotifyCheckButton.visible = !isCheckingSpotify;
    this.spotifyCheckSpinner.visible = isCheckingSpotify;
    const hasCheckResult = isCheckingSpotify || spotifyCheckText !== '';
    this.spotifyCheckResultRow.visible = hasCheckResult;
    this.spotifyCheckResultLabel.text = isCheckingSpotify ? 'Vérification…' : spotifyCheckText;
    this.spotifyCheckResultLabel.color =
      !isCheckingSpotify && spotifyCheckText.startsWith('Tout est bon') ? COLOR_GREEN : COLOR_TEXT_SECONDARY;
    this.spotifyCard.height = hasCheckResult ? 100 : 64;

    // 5. Sonos
    this.sonosIconNode.color =
      appState.sonosSystem !== null ? COLOR_GREEN : COLOR_TEXT_TERTIARY;
    this.sonosStatusLabel.text =
      appState.sonosSystem !== null
        ? formatPlural((appState.sonosSystem as System).speakers.length, 'pièce') +
          ', ' +
          formatPlural((appState.sonosSystem as System).groups.length, 'groupe')
        : appState.sonosStatusMessage;
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    if (!appState.isSearchingWeatherCity) {
      drawPageHeader('Réglages', appState.sidebarWidth);
    }
  }
}
