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
  SECTION_PREFERENCES,
  SECTION_REMOTE,
  SECTION_SYSTEM,
  SECTION_WIFI,
  SIDEBAR_WIDTH,
  TOP_BAR_HEIGHT,
} from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { isZoneFocused, isZonePressed, registerTapZone } from '../../core/input';
import { appState, refreshSystem, selectSettingsSection } from '../../state';
import { drawFocusRing, drawGlyph, drawLabel } from '../../components/primitives';
import { WifiSectionNode } from './wifi-section';
import { RemoteSectionNode } from './remote-section';
import { PreferencesSectionNode } from './preferences-section';
import { SystemSectionNode } from './system-section';

const SIDEBAR_ITEM_HEIGHT = 48;
const SECTION_IDS: string[] = [SECTION_WIFI, SECTION_REMOTE, SECTION_PREFERENCES, SECTION_SYSTEM];
const SECTION_TITLES: string[] = ['Wi-Fi', 'Remote access', 'Preferences', 'System'];
const SECTION_ICONS: string[] = ['wifi', 'laptop', 'palette', 'cpu'];

export class SettingsPageNode extends DisplayObject {
  private content: DisplayObject = new DisplayObject('SettingsContent');
  private sections: DisplayObject[] = [new WifiSectionNode(), new RemoteSectionNode(), new PreferencesSectionNode(), new SystemSectionNode()];
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
    this.content.x = SIDEBAR_WIDTH;
    this.content.y = TOP_BAR_HEIGHT;
    this.content.width = this.width - SIDEBAR_WIDTH;
    this.content.height = this.height - TOP_BAR_HEIGHT;
    for (let index = 0; index < this.sections.length; index++) {
      this.sections[index].width = this.content.width;
      this.sections[index].height = this.content.height;
    }
  }

  override onDraw(pageWidth: number, pageHeight: number): void {
    rect(0, 0, pageWidth, pageHeight, COLOR_BACKGROUND);
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
}
