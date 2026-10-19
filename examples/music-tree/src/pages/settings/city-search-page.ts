// ============================================================================
// pages/settings/city-search-page.ts — Weather city search sub-page
// ============================================================================
// Built with `PageHeaderBarNode`, `SearchFieldNode` and `VirtualKeyboardNode`.

import { rrect, textWidth, fontAscent } from 'zinc:gfx';
import {
  COLOR_ACCENT,
  COLOR_CARD_ELEVATED,
  COLOR_FILL,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  PAGE_PADDING,
  PAGE_SETTINGS,
} from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import {
  beginScrollBox,
  endScrollBox,
  isZonePressed,
  registerTapZone,
} from '../../core/input';
import {
  drawCenteredText,
  drawGlyph,
  drawLabel,
  drawSeparatorLine,
} from '../../components/primitives';
import { drawActivitySpinner } from '../../components/slider';
import { VirtualKeyboardNode, getTouchKeyboardHeight } from '../../components/keyboard';
import {
  PageHeaderBarNode,
  PillButtonNode,
  SearchFieldNode,
} from '../../components/layout-nodes';
import { saveAppConfig } from '../../services/config';
import {
  GeocodedPlace,
  getFoundPlaces,
  getPlaceSearchStatus,
  setWeatherLocation,
  triggerPlaceSearch,
} from '../../services/weather-service';
import { appState, showToast } from '../../state';

export class CitySearchSubpageNode extends DisplayObject {
  readonly headerBar: PageHeaderBarNode;
  readonly cancelButtonNode: PillButtonNode;
  readonly searchFieldNode: SearchFieldNode;
  readonly keyboardNode: VirtualKeyboardNode;

  constructor() {
    super('CitySearchSubpage');

    this.headerBar = new PageHeaderBarNode('Ville de la météo', 14);
    this.cancelButtonNode = new PillButtonNode('city/cancel', 'Annuler', '', () => {
      appState.isSearchingWeatherCity = false;
      appState.isKeyboardVisible = false;
    });
    this.headerBar.addChild(this.cancelButtonNode);

    this.searchFieldNode = new SearchFieldNode(
      "Nom d'une ville",
      () => {
        appState.isKeyboardVisible = true;
      },
      () => {
        appState.weatherCityQuery = '';
        triggerPlaceSearch('');
      }
    );
    this.searchFieldNode.y = 100;

    this.keyboardNode = new VirtualKeyboardNode();

    this.addChild(this.headerBar);
    this.addChild(this.searchFieldNode);
    this.addChild(this.keyboardNode);
  }

  override onMeasure(): void {
    const sidebarWidth = appState.sidebarWidth;
    const pageWidth = this.width > 0 ? this.width : 1024;

    this.headerBar.x = sidebarWidth;
    this.headerBar.width = pageWidth - sidebarWidth;
    this.headerBar.setPaddingSymmetric(PAGE_PADDING, 0);

    this.searchFieldNode.x = sidebarWidth + PAGE_PADDING;
    this.searchFieldNode.width = pageWidth - sidebarWidth - PAGE_PADDING * 2;
    this.searchFieldNode.currentText = appState.weatherCityQuery;
    this.searchFieldNode.isTypingActive = appState.isKeyboardVisible;

    this.keyboardNode.visible = appState.isKeyboardVisible;
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    const sidebarWidth = appState.sidebarWidth;
    const contentStartX = sidebarWidth + PAGE_PADDING;
    const contentWidth = viewWidth - sidebarWidth - PAGE_PADDING * 2;
    const listTopY = 166;
    const listBottomY = viewHeight - getTouchKeyboardHeight();
    const placeRowHeight = 66;

    const matchingPlaces = getFoundPlaces();
    const searchStatus = getPlaceSearchStatus();

    if (searchStatus === 'loading' && matchingPlaces.length === 0) {
      drawActivitySpinner(
        sidebarWidth + (viewWidth - sidebarWidth) / 2,
        listTopY + 60,
        16
      );
    } else if (searchStatus === '' && matchingPlaces.length === 0) {
      drawCenteredText(
        Fonts.label,
        sidebarWidth + (viewWidth - sidebarWidth) / 2,
        listTopY + 50,
        'Tape au moins deux lettres',
        COLOR_TEXT_SECONDARY
      );
    } else if (searchStatus !== 'ok' && searchStatus !== 'loading') {
      drawCenteredText(
        Fonts.label,
        sidebarWidth + (viewWidth - sidebarWidth) / 2,
        listTopY + 50,
        searchStatus,
        COLOR_TEXT_SECONDARY
      );
    }

    const settingsScrollBox = appState.pageScrollBoxes[PAGE_SETTINGS];
    beginScrollBox(
      settingsScrollBox,
      sidebarWidth,
      listTopY,
      viewWidth - sidebarWidth,
      listBottomY - listTopY
    );
    settingsScrollBox.contentHeight = matchingPlaces.length * placeRowHeight + 24;

    for (let index = 0; index < matchingPlaces.length; index++) {
      const place = matchingPlaces[index];
      const rowY = listTopY + index * placeRowHeight - settingsScrollBox.scrollY;
      const rowZoneId = 'city/' + index;
      if (rowY > listBottomY || rowY + placeRowHeight < listTopY) continue;

      if (isZonePressed(rowZoneId)) {
        rrect(
          contentStartX - 10,
          rowY,
          contentWidth + 20,
          placeRowHeight,
          10,
          COLOR_CARD_ELEVATED,
          255
        );
      }

      const codeBadgeWidth = Math.max(
        44,
        textWidth(Fonts.smallBold, place.countryCode, 0) + 20
      );
      rrect(contentStartX, rowY + 17, codeBadgeWidth, 32, 8, COLOR_FILL, 255);
      drawCenteredText(
        Fonts.smallBold,
        contentStartX + codeBadgeWidth / 2,
        rowY + 33 - fontAscent(Fonts.smallBold) / 2 - 1,
        place.countryCode,
        COLOR_TEXT_PRIMARY
      );

      drawLabel(
        Fonts.label,
        contentStartX + 64,
        rowY + 11,
        place.name,
        COLOR_TEXT_PRIMARY,
        contentWidth - 120
      );
      const regionAndCountry =
        place.region !== '' && place.region !== place.name
          ? `${place.region}, ${place.country}`
          : place.country;
      drawLabel(
        Fonts.small,
        contentStartX + 64,
        rowY + 37,
        regionAndCountry,
        COLOR_TEXT_SECONDARY,
        contentWidth - 120
      );

      const isCurrentlySelectedCity =
        appState.config.weatherCityName === place.name &&
        Math.abs(appState.config.weatherLatitude - place.latitude) < 0.01 &&
        Math.abs(appState.config.weatherLongitude - place.longitude) < 0.01;
      if (isCurrentlySelectedCity) {
        drawGlyph(
          'check',
          contentStartX + contentWidth - 28,
          rowY + 21,
          24,
          COLOR_ACCENT
        );
      }

      if (index < matchingPlaces.length - 1) {
        drawSeparatorLine(
          contentStartX + 64,
          rowY + placeRowHeight - 1,
          contentWidth - 64
        );
      }

      registerTapZone(
        rowZoneId,
        contentStartX,
        rowY,
        contentWidth,
        placeRowHeight,
        () => this.selectWeatherPlace(place)
      );
    }

    endScrollBox();
  }

  private selectWeatherPlace(place: GeocodedPlace): void {
    appState.config.weatherLatitude = place.latitude;
    appState.config.weatherLongitude = place.longitude;
    appState.config.weatherCityName = place.name;
    saveAppConfig(appState.config);
    setWeatherLocation(place.latitude, place.longitude, place.name);
    appState.isSearchingWeatherCity = false;
    appState.isKeyboardVisible = false;
    showToast(`Météo : ${place.name}`);
  }
}
