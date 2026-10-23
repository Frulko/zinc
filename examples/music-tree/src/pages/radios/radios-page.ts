// ============================================================================
// pages/radios/radios-page.ts — Radios page (My radios, Popular, Search)
// ============================================================================
// Built with the `DisplayObject` tree and its Flexbox layout components:
// - `headerBar` (`PageHeaderBarNode`: title + `SpacerNode(1)` + Edit button + tabs)
// - `searchFieldNode` (`SearchFieldNode`)
// - `keyboardNode` (`VirtualKeyboardNode`)

import { rrect } from 'zinc:gfx';
import {
  COLOR_ACCENT,
  COLOR_DANGER,
  COLOR_FILL,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  GRID_GAP,
  PAGE_PADDING,
  PAGE_RADIOS,
} from '../../constants';
import { mediaColumns } from '../../core/responsive';
import { Fonts } from '../../fonts';
import { DisplayObject, ScrollBox, beginScrollBox, endScrollBox, registerTapZone } from 'zinc:stage';
import {
  drawCenteredText,
  drawGlyph,
} from '../../components/primitives';
import { drawMediaTile } from '../../components/cover';
import { VirtualKeyboardNode, getTouchKeyboardHeight } from '../../components/keyboard';
import {
  PageHeaderBarNode,
  PillButtonNode,
  SearchFieldNode,
  SegmentedControlNode,
} from '../../components/layout-nodes';
import {
  RadioStation,
  findStationIndexByUrl,
} from '../../services/radios-service';
import {
  appState,
  isStationCurrentlyPlaying,
  loadPopularRadios,
  playRadioStation,
  removeMyRadioStation,
  toggleFavoriteRadioStation,
} from '../../state';

export class RadiosPageNode extends DisplayObject {
  readonly headerBar: PageHeaderBarNode;
  readonly editButtonNode: PillButtonNode;
  readonly tabsSegmentedNode: SegmentedControlNode;
  readonly searchFieldNode: SearchFieldNode;
  readonly keyboardNode: VirtualKeyboardNode;

  constructor() {
    super('RadiosPage');

    // Flexbox header bar: Title on the left, Spacer in the middle, Edit button + Tabs on the right
    this.headerBar = new PageHeaderBarNode('Radios', 14);
    this.editButtonNode = new PillButtonNode('radio/edit', 'Modifier', '', () => {
      appState.isEditingMyRadios = !appState.isEditingMyRadios;
    });
    this.tabsSegmentedNode = new SegmentedControlNode(
      'radio/tab',
      ['Mes radios', 'Populaires', 'Rechercher'],
      (selectedTab: i32) => {
        appState.activeRadioTab = selectedTab;
        appState.isKeyboardVisible = selectedTab === 2 && appState.searchQuery === '';
        appState.isEditingMyRadios = false;
        if (selectedTab === 1) {
          loadPopularRadios();
        }
      },
      126
    );
    this.headerBar.addChild(this.editButtonNode);
    this.headerBar.addChild(this.tabsSegmentedNode);

    // Search field (visible on the Search tab)
    this.searchFieldNode = new SearchFieldNode(
      "Nom d'une radio, d'une ville, d'un style",
      () => {
        appState.isKeyboardVisible = true;
      },
      () => {
        appState.searchQuery = '';
      }
    );
    this.searchFieldNode.y = 100;

    // Virtual AZERTY keyboard
    this.keyboardNode = new VirtualKeyboardNode();

    this.addChild(this.headerBar);
    this.addChild(this.searchFieldNode);
    this.addChild(this.keyboardNode);
  }

  override onAddedToStage(): void {
    if (appState.activeRadioTab === 1) {
      loadPopularRadios();
    }
  }

  override onMeasure(): void {
    const sidebarWidth = appState.sidebarWidth;
    const pageWidth = this.width > 0 ? this.width : 1024;

    this.headerBar.x = sidebarWidth;
    this.headerBar.width = pageWidth - sidebarWidth;
    this.headerBar.setPaddingSymmetric(PAGE_PADDING, 0);

    this.editButtonNode.visible = appState.activeRadioTab === 0;
    this.editButtonNode.label = appState.isEditingMyRadios ? 'Terminé' : 'Modifier';
    this.editButtonNode.foregroundColor = appState.isEditingMyRadios
      ? 0x000000
      : COLOR_TEXT_PRIMARY;
    this.editButtonNode.backgroundColor = appState.isEditingMyRadios
      ? 0xffffff
      : COLOR_FILL;

    const compact = pageWidth - sidebarWidth < 650;
    this.headerBar.direction = compact ? 'column' : 'row';
    this.headerBar.height = compact ? (this.editButtonNode.visible ? 148 : 94) : 44;
    this.headerBar.alignItems = compact ? 'start' : 'center';
    this.tabsSegmentedNode.maxWidth = pageWidth - sidebarWidth - PAGE_PADDING * 2;
    this.tabsSegmentedNode.selectedIndex = appState.activeRadioTab;

    this.searchFieldNode.visible = appState.activeRadioTab === 2;
    this.searchFieldNode.y = this.headerBar.y + this.headerBar.height + 26;
    this.searchFieldNode.x = sidebarWidth + PAGE_PADDING;
    this.searchFieldNode.width = pageWidth - sidebarWidth - PAGE_PADDING * 2;
    this.searchFieldNode.currentText = appState.searchQuery;
    this.searchFieldNode.isTypingActive = appState.isKeyboardVisible;

    this.keyboardNode.visible =
      appState.activeRadioTab === 2 && appState.isKeyboardVisible;
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    const sidebarWidth = appState.sidebarWidth;
    const contentBottomY =
      viewHeight - getTouchKeyboardHeight();
    const contentTopY = this.headerBar.y + this.headerBar.height + 26;
    const radiosScrollBox = appState.pageScrollBoxes[PAGE_RADIOS];

    if (appState.activeRadioTab === 0) {
      this.drawStationGrid(
        appState.myStations,
        'mine',
        contentTopY,
        contentBottomY,
        viewWidth,
        radiosScrollBox,
        true,
        'Ajoute des radios depuis Populaires ou Rechercher'
      );
    } else if (appState.activeRadioTab === 1) {
      if (
        appState.popularStationsState === 'loading' ||
        appState.popularStationsState === ''
      ) {
        drawCenteredText(
          Fonts.label,
          sidebarWidth + (viewWidth - sidebarWidth) / 2,
          200,
          'Chargement…',
          COLOR_TEXT_SECONDARY
        );
      } else if (appState.popularStationsState !== 'ok') {
        drawCenteredText(
          Fonts.label,
          sidebarWidth + (viewWidth - sidebarWidth) / 2,
          200,
          appState.popularStationsState,
          COLOR_TEXT_SECONDARY
        );
      } else {
        this.drawStationGrid(
          appState.popularStations,
          'pop',
          contentTopY,
          contentBottomY,
          viewWidth,
          radiosScrollBox,
          false,
          ''
        );
      }
    } else {
      if (appState.searchedStationsState === 'loading') {
        drawCenteredText(
          Fonts.label,
          sidebarWidth + (viewWidth - sidebarWidth) / 2,
          230,
          'Recherche…',
          COLOR_TEXT_SECONDARY
        );
      } else if (
        appState.searchedStationsState !== '' &&
        appState.searchedStationsState !== 'ok'
      ) {
        drawCenteredText(
          Fonts.label,
          sidebarWidth + (viewWidth - sidebarWidth) / 2,
          230,
          appState.searchedStationsState,
          COLOR_TEXT_SECONDARY
        );
      } else {
        this.drawStationGrid(
          appState.searchedStations,
          'found',
          contentTopY + 66,
          contentBottomY,
          viewWidth,
          radiosScrollBox,
          false,
          ''
        );
      }
    }
  }

  private drawStationGrid(
    stationsList: RadioStation[],
    zoneIdPrefix: string,
    topY: number,
    bottomY: number,
    viewWidth: number,
    scrollBox: ScrollBox,
    isEditableFavorites: boolean,
    emptyStateMessage: string
  ): void {
    const sidebarWidth = appState.sidebarWidth;
    const contentStartX = sidebarWidth + PAGE_PADDING;
    const contentWidth = viewWidth - sidebarWidth - PAGE_PADDING * 2;
    const columns = mediaColumns(contentWidth);
    const tileSize = (contentWidth - GRID_GAP * (columns - 1)) / columns;
    const rowHeight = tileSize + 62;

    beginScrollBox(
      scrollBox,
      sidebarWidth,
      topY,
      viewWidth - sidebarWidth,
      bottomY - topY
    );
    scrollBox.contentHeight =
      Math.ceil(stationsList.length / columns) * rowHeight + 24;

    if (stationsList.length === 0) {
      drawCenteredText(
        Fonts.label,
        sidebarWidth + (viewWidth - sidebarWidth) / 2,
        topY + 80,
        emptyStateMessage,
        COLOR_TEXT_SECONDARY
      );
    }

    for (let index = 0; index < stationsList.length; index++) {
      const station = stationsList[index];
      const columnIndex = index % columns;
      const rowIndex = Math.floor(index / columns);
      const tileX = contentStartX + columnIndex * (tileSize + GRID_GAP);
      const tileY = topY + 8 + rowIndex * rowHeight - scrollBox.scrollY;

      if (tileY > bottomY || tileY + rowHeight < topY) continue;

      drawMediaTile(
        `${zoneIdPrefix}/${index}`,
        tileX,
        tileY,
        tileSize,
        station.artworkUrl,
        station.name,
        station.tags,
        true,
        isStationCurrentlyPlaying(station),
        () => {
          if (appState.isEditingMyRadios && isEditableFavorites) {
            removeMyRadioStation(station);
          } else {
            playRadioStation(station);
          }
        }
      );

      const favoriteIndex = findStationIndexByUrl(appState.myStations, station.streamUrl);
      if (isEditableFavorites && appState.isEditingMyRadios) {
        rrect(tileX - 8, tileY - 8, 32, 32, 16, COLOR_DANGER, 255);
        rrect(tileX, tileY + 6, 16, 3, 1, 0xffffff, 255);
        registerTapZone(`${zoneIdPrefix}/rm/${index}`, tileX - 14, tileY - 14, 44, 44, () =>
          removeMyRadioStation(station)
        );
      } else if (!isEditableFavorites) {
        const badgeX = tileX + tileSize - 40;
        const badgeY = tileY + 8;
        rrect(
          badgeX,
          badgeY,
          32,
          32,
          16,
          favoriteIndex >= 0 ? COLOR_ACCENT : 0x000000,
          favoriteIndex >= 0 ? 255 : 150
        );
        drawGlyph(
          favoriteIndex >= 0 ? 'check' : 'plus',
          badgeX + 6,
          badgeY + 6,
          20,
          COLOR_TEXT_PRIMARY
        );
        registerTapZone(`${zoneIdPrefix}/add/${index}`, badgeX - 6, badgeY - 6, 44, 44, () =>
          toggleFavoriteRadioStation(station)
        );
      }
    }

    endScrollBox();
  }
}
