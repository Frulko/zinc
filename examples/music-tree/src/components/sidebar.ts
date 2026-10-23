// ============================================================================
// components/sidebar.ts — Navigation sidebar and mini player
// ============================================================================
// Shows the 5 main sections (À l'écoute, Radios, Spotify, Enceintes,
// Réglages), the selector of the controlled room and the mini player when
// the user is on a page other than the main player.

import { rect, rrect, drawText } from 'zinc:gfx';
import { Group } from 'zinc:sonos';
import {
  COLOR_ACCENT,
  COLOR_BACKGROUND,
  COLOR_CARD,
  COLOR_CARD_ELEVATED,
  COLOR_FILL,
  COLOR_GREEN,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  PAGE_NOW_PLAYING,
  PAGE_RADIOS,
  PAGE_SPOTIFY,
  PAGE_ROOMS,
  PAGE_SETTINGS,
} from '../constants';
import { Fonts } from '../fonts';
import { DisplayObject, ScrollBox, beginScrollBox, endScrollBox, registerTapZone, isZonePressed, uiState } from 'zinc:stage';
import { drawGlyph, drawLabel, drawTransportIcon } from './primitives';
import { drawCoverArt } from './cover';
import {
  appState,
  navigateToPage,
  getGroupArtworkUrl,
  executeGroupCommand,
  togglePlayPause,
} from '../state';

const NAVIGATION_TITLES: string[] = [
  "À l'écoute",
  'Radios',
  'Spotify',
  'Enceintes',
  'Réglages',
];

const NAVIGATION_ICONS: string[] = [
  'audio-lines',
  'radio',
  'library',
  'speaker',
  'settings',
];

const compactScroll = new ScrollBox();
const NAVIGATION_ACTIONS: (() => void)[] = [
  () => navigateToPage(PAGE_NOW_PLAYING), () => navigateToPage(PAGE_RADIOS), () => navigateToPage(PAGE_SPOTIFY),
  () => navigateToPage(PAGE_ROOMS), () => navigateToPage(PAGE_SETTINGS),
];

/**
 * Draws the sidebar over a height `viewHeight`.
 */
export function drawSidebarContent(viewWidth: number, viewHeight: number): void {
  const sidebarWidth = appState.sidebarWidth;
  if (sidebarWidth === 0) return;

  const isOverPlayerBackdrop = appState.currentPage === PAGE_NOW_PLAYING;
  if (isOverPlayerBackdrop) {
    rrect(0, 0, sidebarWidth, viewHeight, 0, 0x000000, 110);
  } else {
    rect(0, 0, sidebarWidth, viewHeight, COLOR_BACKGROUND);
  }
  rect(sidebarWidth - 1, 0, 1, viewHeight, isOverPlayerBackdrop ? 0x000000 : 0x1f1f21);

  if (sidebarWidth < 120) {
    const gap = 54;
    compactScroll.contentHeight = 24 + gap * NAVIGATION_TITLES.length;
    compactScroll.viewportHeight = viewHeight;
    compactScroll.clamp();
    beginScrollBox(compactScroll, 0, 0, sidebarWidth, viewHeight);
    for (let index = 0; index < NAVIGATION_TITLES.length; index++) {
      const y = 12 + index * gap - compactScroll.scrollY;
      const selected = appState.currentPage === index;
      if (selected) rrect(8, y, sidebarWidth - 16, 46, 10, COLOR_FILL, 255);
      drawGlyph(NAVIGATION_ICONS[index], (sidebarWidth - 22) / 2, y + 12, 22, selected ? COLOR_ACCENT : COLOR_TEXT_SECONDARY);
      registerTapZone('nav/' + index, 8, y, sidebarWidth - 16, 46, NAVIGATION_ACTIONS[index]);
    }
    endScrollBox();
    return;
  }

  drawText(Fonts.title, 26, 34, 'Musique', COLOR_TEXT_PRIMARY, 255, 0);

  for (let itemIndex = 0; itemIndex < NAVIGATION_TITLES.length; itemIndex++) {
    const itemY = 96 + itemIndex * 54;
    const zoneId = 'nav/' + itemIndex;
    const isSelected = appState.currentPage === itemIndex;

    if (isSelected) {
      rrect(
        12,
        itemY,
        sidebarWidth - 24,
        46,
        10,
        isOverPlayerBackdrop ? 0xffffff : COLOR_FILL,
        isOverPlayerBackdrop ? 40 : 255
      );
    } else if (isZonePressed(zoneId)) {
      rrect(
        12,
        itemY,
        sidebarWidth - 24,
        46,
        10,
        isOverPlayerBackdrop ? 0xffffff : COLOR_CARD_ELEVATED,
        isOverPlayerBackdrop ? 20 : 255
      );
    }

    drawGlyph(
      NAVIGATION_ICONS[itemIndex],
      26,
      itemY + 12,
      22,
      isSelected ? COLOR_ACCENT : COLOR_TEXT_SECONDARY
    );
    drawText(Fonts.label, 62, itemY + 13, NAVIGATION_TITLES[itemIndex], COLOR_TEXT_PRIMARY, 255, 0);

    const targetPageIndex = itemIndex as i32;
    registerTapZone(zoneId, 12, itemY, sidebarWidth - 24, 46, () =>
      navigateToPage(targetPageIndex)
    );
  }

  if (appState.activeGroup === null) return;
  const activeGroup = appState.activeGroup as Group;

  // Panel of the controlled room (context of all the commands)
  const groupBoxY = viewHeight - (isOverPlayerBackdrop ? 92 : 214);
  if (isOverPlayerBackdrop) {
    rrect(12, groupBoxY, sidebarWidth - 24, 64, 12, 0xffffff, isZonePressed('side/room') ? 50 : 25);
  } else {
    rrect(
      12,
      groupBoxY,
      sidebarWidth - 24,
      64,
      12,
      isZonePressed('side/room') ? COLOR_FILL : COLOR_CARD,
      255
    );
  }

  drawGlyph(
    'speaker',
    24,
    groupBoxY + 20,
    24,
    activeGroup.playing() ? COLOR_GREEN : COLOR_TEXT_SECONDARY
  );
  drawLabel(Fonts.smallBold, 58, groupBoxY + 13, activeGroup.name(), COLOR_TEXT_PRIMARY, sidebarWidth - 86);
  const playbackStateLabel = activeGroup.playing()
    ? 'En lecture'
    : activeGroup.state === 'PAUSED_PLAYBACK'
    ? 'En pause'
    : 'Arrêté';
  drawLabel(Fonts.tiny, 58, groupBoxY + 36, playbackStateLabel, COLOR_TEXT_SECONDARY, sidebarWidth - 86);
  registerTapZone('side/room', 12, groupBoxY, sidebarWidth - 24, 64, () => {
    appState.isContextSheetOpen = true;
    uiState.dirty = true;
  });

  if (isOverPlayerBackdrop) return;

  // Mini player shown at the bottom of the sidebar on the other pages
  const miniPlayerY = viewHeight - 138;
  rrect(12, miniPlayerY, sidebarWidth - 24, 122, 12, COLOR_CARD, 255);
  const coverTitle =
    activeGroup.track.title !== '' ? activeGroup.track.title : activeGroup.track.station;
  drawCoverArt(getGroupArtworkUrl(activeGroup), coverTitle, 24, miniPlayerY + 12, 52, 8);

  drawLabel(
    Fonts.smallBold,
    86,
    miniPlayerY + 16,
    activeGroup.track.title !== '' ? activeGroup.track.title : 'Rien en lecture',
    COLOR_TEXT_PRIMARY,
    sidebarWidth - 112
  );
  drawLabel(
    Fonts.tiny,
    86,
    miniPlayerY + 40,
    activeGroup.track.artist !== '' ? activeGroup.track.artist : activeGroup.track.station,
    COLOR_TEXT_SECONDARY,
    sidebarWidth - 112
  );
  registerTapZone('mini/open', 12, miniPlayerY, sidebarWidth - 24, 70, () =>
    navigateToPage(PAGE_NOW_PLAYING)
  );

  const controlsCenterY = miniPlayerY + 96;
  drawTransportIcon('prev', sidebarWidth / 2 - 64, controlsCenterY, 22, COLOR_TEXT_PRIMARY);
  registerTapZone('mini/prev', sidebarWidth / 2 - 90, controlsCenterY - 22, 52, 44, () =>
    executeGroupCommand('Précédent', (system, group) => system.previous(group))
  );

  drawTransportIcon(
    activeGroup.playing() ? 'pause' : 'play',
    sidebarWidth / 2,
    controlsCenterY,
    26,
    COLOR_TEXT_PRIMARY
  );
  registerTapZone('mini/play', sidebarWidth / 2 - 28, controlsCenterY - 24, 56, 48, togglePlayPause);

  drawTransportIcon('next', sidebarWidth / 2 + 64, controlsCenterY, 22, COLOR_TEXT_PRIMARY);
  registerTapZone('mini/next', sidebarWidth / 2 + 38, controlsCenterY - 22, 52, 44, () =>
    executeGroupCommand('Suivant', (system, group) => system.next(group))
  );
}

/**
 * Display tree node for the sidebar (on the pages outside the carousel).
 */
export class SidebarNode extends DisplayObject {
  constructor() {
    super('Sidebar');
  }

  override onUpdate(deltaSeconds: number): void {
    if (compactScroll.stepInertia(deltaSeconds)) uiState.dirty = true;
  }

  override onDraw(stageWidth: number, stageHeight: number): void {
    if (appState.currentPage === PAGE_NOW_PLAYING) return;
    drawSidebarContent(stageWidth, stageHeight);
  }
}
