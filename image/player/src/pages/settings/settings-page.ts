// ============================================================================
// pages/settings/settings-page.ts — The settings: a sidebar and the section chosen
// ============================================================================
// The section shown is a child node mounted by `syncSection()` (main.ts calls it before a frame), so each section
// loads its data in its own onAddedToStage.

import { rect, rrect } from 'zinc:gfx';
import {
  COLOR_ACCENT,
  COLOR_BACKGROUND,
  COLOR_CARD_PRESSED,
  COLOR_SEPARATOR,
  COLOR_SIDEBAR,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  SECTION_DISPLAY,
  SECTION_PREFERENCES,
  SECTION_REMOTE,
  SECTION_SYSTEM,
  SECTION_WIFI,
  SECTION_UPDATES,
  SIDEBAR_WIDTH,
  TOP_BAR_HEIGHT,
} from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { isZoneFocused, isZonePressed, registerTapZone } from '../../core/input';
import { appState, refreshSystem, selectSettingsSection } from '../../state';
import { drawCenteredText, drawFocusRing, drawGlyph, drawLabel } from '../../components/primitives';
import { WifiSectionNode } from './wifi-section';
import { RemoteSectionNode } from './remote-section';
import { PreferencesSectionNode } from './preferences-section';
import { DisplaySectionNode } from './display-section';
import { SystemSectionNode } from './system-section';
import { UpdatesSectionNode } from './updates-section';

const SIDEBAR_ITEM_HEIGHT = 48;
const SECTION_IDS: string[] = [SECTION_WIFI, SECTION_REMOTE, SECTION_PREFERENCES, SECTION_DISPLAY, SECTION_SYSTEM, SECTION_UPDATES];
const SECTION_TITLES: string[] = ['Wi-Fi', 'Remote access', 'Preferences', 'Display', 'System', 'Updates'];
const SECTION_ICONS: string[] = ['wifi', 'laptop', 'palette', 'monitor', 'cpu', 'download'];

const SECTION_SHORT_TITLES: string[] = ['Wi-Fi', 'Remote', 'Prefs', 'Display', 'System', 'Updates'];
/** Narrower than this the sections are a row of tabs under the bar instead of a sidebar. */
const NARROW_WIDTH = 640;
const TAB_HEIGHT = 58;

export class SettingsPageNode extends DisplayObject {
  private content: DisplayObject = new DisplayObject('SettingsContent');
  private sections: DisplayObject[] = [new WifiSectionNode(), new RemoteSectionNode(), new PreferencesSectionNode(), new DisplaySectionNode(), new SystemSectionNode(), new UpdatesSectionNode()];
  private mountedSection: string = '';

  constructor() {
    super('SettingsPage');
    this.addChild(this.content);
  }

  override onAddedToStage(): void {
    refreshSystem();
  }

  /** Mounts the section `appState.settingsSection` names, when it changed. */
  syncSection(): void {
    if (this.mountedSection === appState.settingsSection) return;
    this.mountedSection = appState.settingsSection;
    this.content.removeChildren();
    const index = SECTION_IDS.indexOf(this.mountedSection);
    this.content.addChild(this.sections[index < 0 ? 0 : index]);
  }

  override onMeasure(): void {
    const isNarrow = this.width < NARROW_WIDTH;
    this.content.x = isNarrow ? 0 : SIDEBAR_WIDTH;
    this.content.y = isNarrow ? TOP_BAR_HEIGHT + TAB_HEIGHT : TOP_BAR_HEIGHT;
    this.content.width = this.width - this.content.x;
    this.content.height = this.height - this.content.y;
    for (let index = 0; index < this.sections.length; index++) {
      this.sections[index].width = this.content.width;
      this.sections[index].height = this.content.height;
    }
  }

  override onDraw(pageWidth: number, pageHeight: number): void {
    rect(0, 0, pageWidth, pageHeight, COLOR_BACKGROUND);
    if (pageWidth < NARROW_WIDTH) {
      this.drawTabs(pageWidth);
      return;
    }
    rect(0, TOP_BAR_HEIGHT, SIDEBAR_WIDTH, pageHeight - TOP_BAR_HEIGHT, COLOR_SIDEBAR);
    rect(SIDEBAR_WIDTH - 1, TOP_BAR_HEIGHT, 1, pageHeight - TOP_BAR_HEIGHT, COLOR_SEPARATOR);
    for (let index = 0; index < SECTION_IDS.length; index++) {
      const sectionId = SECTION_IDS[index];
      const zoneId = 'section/' + sectionId;
      const itemX = 12;
      const itemY = TOP_BAR_HEIGHT + 16 + index * (SIDEBAR_ITEM_HEIGHT + 4);
      const itemWidth = SIDEBAR_WIDTH - 24;
      const isSelected = appState.settingsSection === sectionId;
      if (isSelected || isZonePressed(zoneId)) rrect(itemX, itemY, itemWidth, SIDEBAR_ITEM_HEIGHT, 12, COLOR_CARD_PRESSED, 255);
      if (isSelected) rrect(itemX, itemY + 12, 4, SIDEBAR_ITEM_HEIGHT - 24, 2, COLOR_ACCENT, 255);
      if (isZoneFocused(zoneId)) drawFocusRing(itemX, itemY, itemWidth, SIDEBAR_ITEM_HEIGHT, 12);
      const color = isSelected ? COLOR_TEXT_PRIMARY : COLOR_TEXT_SECONDARY;
      drawGlyph(SECTION_ICONS[index], itemX + 16, itemY + (SIDEBAR_ITEM_HEIGHT - 22) / 2, 22, color);
      drawLabel(isSelected ? Fonts.labelBold : Fonts.label, itemX + 50, itemY + (SIDEBAR_ITEM_HEIGHT - 20) / 2, SECTION_TITLES[index], color,
        itemWidth - 60);
      registerTapZone(zoneId, itemX, itemY, itemWidth, SIDEBAR_ITEM_HEIGHT, () => selectSettingsSection(sectionId));
    }
  }

  /** A narrow screen: the sections as a row of tabs, icon over name, as wide as the screen allows. */
  private drawTabs(pageWidth: number): void {
    rect(0, TOP_BAR_HEIGHT, pageWidth, TAB_HEIGHT, COLOR_SIDEBAR);
    rect(0, TOP_BAR_HEIGHT + TAB_HEIGHT - 1, pageWidth, 1, COLOR_SEPARATOR);
    const tabWidth = pageWidth / SECTION_IDS.length;
    for (let index = 0; index < SECTION_IDS.length; index++) {
      const sectionId = SECTION_IDS[index];
      const zoneId = 'section/' + sectionId;
      const tabX = index * tabWidth;
      const isSelected = appState.settingsSection === sectionId;
      if (isSelected || isZonePressed(zoneId)) rrect(tabX + 3, TOP_BAR_HEIGHT + 4, tabWidth - 6, TAB_HEIGHT - 9, 10, COLOR_CARD_PRESSED, 255);
      if (isSelected) rrect(tabX + tabWidth / 2 - 14, TOP_BAR_HEIGHT + TAB_HEIGHT - 6, 28, 3, 1.5, COLOR_ACCENT, 255);
      if (isZoneFocused(zoneId)) drawFocusRing(tabX + 3, TOP_BAR_HEIGHT + 4, tabWidth - 6, TAB_HEIGHT - 9, 10);
      const color = isSelected ? COLOR_TEXT_PRIMARY : COLOR_TEXT_SECONDARY;
      drawGlyph(SECTION_ICONS[index], tabX + tabWidth / 2 - 11, TOP_BAR_HEIGHT + 8, 22, color);
      if (tabWidth >= 64) drawCenteredText(Fonts.small, tabX + tabWidth / 2, TOP_BAR_HEIGHT + 34, SECTION_SHORT_TITLES[index], color);
      registerTapZone(zoneId, tabX, TOP_BAR_HEIGHT, tabWidth, TAB_HEIGHT, () => selectSettingsSection(sectionId));
    }
  }
}
