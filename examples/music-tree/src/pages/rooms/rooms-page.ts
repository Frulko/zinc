// ============================================================================
// pages/rooms/rooms-page.ts — the Speakers page, built as a flexbox tree
// ============================================================================
// One card per Sonos group (cover, name, what plays, group and room volumes) and the
// checklist that groups rooms with the controlled group. The tree is built once per
// topology (groups, their rooms, the controlled group); `onMeasure` only writes the
// values that changed into the existing nodes, so an idle page draws no frame.

import { rrect } from 'zinc:gfx';
import { System, Group, Speaker } from 'zinc:sonos';
import {
  COLOR_ACCENT,
  COLOR_CARD,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_TERTIARY,
  PAGE_PADDING,
  PAGE_ROOMS,
} from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject, isZonePressed, registerTapZone } from 'zinc:stage';
import { drawGlyph } from '../../components/primitives';
import {
  CardBox,
  CoverArtNode,
  HBox,
  IconButtonNode,
  LabelNode,
  PageHeaderBarNode,
  PillButtonNode,
  ScrollContainerNode,
  SeparatorNode,
  SliderNode,
  VBox,
} from '../../components/layout-nodes';
import { drawNoSpeakerEmptyState } from '../home/player-slide';
import {
  appState,
  getGroupArtworkUrl,
  navigateToHomePlayer,
  pollAllRoomVolumes,
  pollSonosTopology,
  runSafeNetworkAction,
  selectActiveSonosGroup,
  setSpecificGroupVolume,
  setSpeakerRoomVolume,
  sleepMilliseconds,
} from '../../state';

/** A volume value (0..100, or a dash while unknown) whose text is only rebuilt when the value changes. */
class VolumeValueLabelNode extends LabelNode {
  private shownVolume: i32 = -2;

  constructor() {
    super(Fonts.smallBold, '', COLOR_TEXT_SECONDARY, 20);
    this.fixedWidth = 42;
  }

  showVolume(volume: i32): void {
    if (volume === this.shownVolume) return;
    this.shownVolume = volume;
    this.text = volume >= 0 ? '' + volume : '–';
  }
}

/** The tappable header of a group card: a tap controls the group and opens the player. */
class GroupHeaderRowNode extends HBox {
  readonly zoneId: string;
  isControlledGroup: boolean = false;
  totalCardHeight: number = 76;
  readonly onTapSelectAndGoHome: () => void;

  constructor(groupId: string, onTapSelectAndGoHome: () => void) {
    super(14, 'GroupHeaderRow');
    this.zoneId = 'room/g/' + groupId;
    this.onTapSelectAndGoHome = onTapSelectAndGoHome;
    this.height = 76;
    this.autoHeight = false;
    this.setPaddingSymmetric(18, 0);
  }

  override onDraw(localWidth: number, localHeight: number): void {
    if (this.isControlledGroup) {
      rrect(0, 0, 4, this.totalCardHeight, 2, COLOR_ACCENT, 255);
    }
    if (isZonePressed(this.zoneId)) {
      rrect(0, 0, localWidth, 72, 16, 0xffffff, 15);
    }
    registerTapZone(this.zoneId, 0, 0, localWidth - 160, 72, this.onTapSelectAndGoHome);
  }
}

/** One room of a group card: its name, mute button, volume slider and value. */
class MemberVolumeRowNode extends HBox {
  readonly speakerUuid: string;
  /** The room as the last topology refresh made it (a refresh makes new `Speaker` objects). */
  speaker: Speaker = new Speaker();
  readonly nameLabel: LabelNode;
  readonly muteButton: IconButtonNode;
  readonly volumeSlider: SliderNode;
  readonly volumeLabel: VolumeValueLabelNode;

  constructor(speakerUuid: string) {
    super(10, 'MemberRow');
    this.speakerUuid = speakerUuid;
    this.height = 59;
    this.autoHeight = false;
    this.setPaddingSymmetric(18, 0);

    this.nameLabel = new LabelNode(Fonts.label, '', COLOR_TEXT_PRIMARY, 22);
    this.nameLabel.fixedWidth = 132;
    this.muteButton = new IconButtonNode(
      'room/mute/' + speakerUuid,
      'volume-2',
      20,
      COLOR_TEXT_SECONDARY,
      () => this.toggleMute(),
      32
    );
    this.volumeSlider = new SliderNode(
      'room/v/' + speakerUuid,
      0xffffff,
      (newValue: number, isReleased: boolean) => setSpeakerRoomVolume(this.speaker, newValue)
    );
    this.volumeSlider.flex = 1;
    this.volumeLabel = new VolumeValueLabelNode();

    this.addChild(this.nameLabel);
    this.addChild(this.muteButton);
    this.addChild(this.volumeSlider);
    this.addChild(this.volumeLabel);
  }

  showSpeaker(speaker: Speaker): void {
    this.speaker = speaker;
    this.nameLabel.text = speaker.name;
    this.muteButton.iconName = speaker.muted ? 'volume-x' : 'volume-2';
    this.muteButton.iconColor = speaker.muted ? COLOR_ACCENT : COLOR_TEXT_SECONDARY;
    this.volumeSlider.normalizedValue = speaker.volume >= 0 ? speaker.volume / 100 : 0;
    this.volumeLabel.showVolume(speaker.volume);
  }

  private toggleMute(): void {
    if (appState.sonosSystem === null) return;
    const system = appState.sonosSystem as System;
    const speaker = this.speaker;
    runSafeNetworkAction('Muet', async (): Promise<void> => {
      await system.setMute(speaker, !speaker.muted);
    });
  }
}

/** The card of one Sonos group. Built for one set of rooms; `showGroup` writes the current values. */
class GroupCardNode extends CardBox {
  readonly groupId: string;
  group: Group;
  readonly headerRow: GroupHeaderRowNode;
  readonly coverNode: CoverArtNode;
  readonly nameLabel: LabelNode;
  readonly trackLabel: LabelNode;
  readonly controlledLabel: LabelNode;
  readonly selectButton: PillButtonNode;
  readonly groupVolumeSlider: SliderNode;
  readonly groupVolumeLabel: VolumeValueLabelNode;
  readonly memberRows: MemberVolumeRowNode[] = [];

  // What the track line was built from, so its text is only rebuilt when one of them changes
  private shownTitle: string = '';
  private shownArtist: string = '';
  private shownStation: string = '';
  private shownState: string = '';

  constructor(group: Group) {
    super('column', 76 + group.members.length * 60 + (group.members.length > 1 ? 60 : 0), 'GroupCard');
    const memberCount = group.members.length;
    const totalCardHeight = this.height;
    this.cornerRadius = 16;
    this.groupId = group.id;
    this.group = group;

    this.headerRow = new GroupHeaderRowNode(group.id, () => {
      selectActiveSonosGroup(this.group);
      navigateToHomePlayer();
    });
    this.headerRow.totalCardHeight = totalCardHeight;
    this.coverNode = new CoverArtNode(48, 8);
    this.headerRow.addChild(this.coverNode);

    const titlesColumn = new VBox(4, 'GroupTitles');
    titlesColumn.flex = 1;
    this.nameLabel = new LabelNode(Fonts.bodyBold, '', COLOR_TEXT_PRIMARY, 22);
    this.trackLabel = new LabelNode(Fonts.small, '', COLOR_TEXT_SECONDARY, 20);
    titlesColumn.addChild(this.nameLabel);
    titlesColumn.addChild(this.trackLabel);
    this.headerRow.addChild(titlesColumn);

    this.controlledLabel = new LabelNode(Fonts.tinyBold, 'CONTRÔLÉ', COLOR_ACCENT, 18);
    this.selectButton = new PillButtonNode('room/sel/' + group.id, 'Contrôler', '', () =>
      selectActiveSonosGroup(this.group)
    );
    this.headerRow.addChild(this.controlledLabel);
    this.headerRow.addChild(this.selectButton);
    this.addChild(this.headerRow);

    // The group's own volume, only when it holds several rooms
    const groupVolumeRow = new HBox(14, 'GroupVolumeRow');
    groupVolumeRow.height = 59;
    groupVolumeRow.autoHeight = false;
    groupVolumeRow.setPaddingSymmetric(18, 0);
    const groupLabel = new LabelNode(Fonts.smallBold, 'Groupe', COLOR_TEXT_PRIMARY, 20);
    groupLabel.fixedWidth = 168;
    this.groupVolumeSlider = new SliderNode(
      'room/gv/' + group.id,
      COLOR_ACCENT,
      (newValue: number, isReleased: boolean) => setSpecificGroupVolume(this.group, newValue)
    );
    this.groupVolumeSlider.flex = 1;
    this.groupVolumeLabel = new VolumeValueLabelNode();
    groupVolumeRow.addChild(groupLabel);
    groupVolumeRow.addChild(this.groupVolumeSlider);
    groupVolumeRow.addChild(this.groupVolumeLabel);
    if (memberCount > 1) {
      this.addChild(new SeparatorNode(18, 18));
      this.addChild(groupVolumeRow);
    }

    for (let memberIndex = 0; memberIndex < memberCount; memberIndex++) {
      const memberRow = new MemberVolumeRowNode(group.members[memberIndex].uuid);
      this.memberRows.push(memberRow);
      this.addChild(new SeparatorNode(18, 18));
      this.addChild(memberRow);
    }
  }

  /** True when this card was built for the same group and the same rooms in the same order. */
  matchesGroup(group: Group): boolean {
    if (group.id !== this.groupId || group.members.length !== this.memberRows.length) return false;
    for (let memberIndex = 0; memberIndex < this.memberRows.length; memberIndex++) {
      if (this.memberRows[memberIndex].speakerUuid !== group.members[memberIndex].uuid) return false;
    }
    return true;
  }

  showGroup(group: Group, isControlledGroup: boolean): void {
    this.group = group;
    const track = group.track;
    this.headerRow.isControlledGroup = isControlledGroup;
    this.coverNode.imageUrl = getGroupArtworkUrl(group);
    this.coverNode.title = track.title !== '' ? track.title : track.station;
    this.controlledLabel.visible = isControlledGroup;
    this.selectButton.visible = !isControlledGroup;

    if (
      track.title !== this.shownTitle ||
      track.artist !== this.shownArtist ||
      track.station !== this.shownStation ||
      group.state !== this.shownState ||
      this.nameLabel.text === ''
    ) {
      this.shownTitle = track.title;
      this.shownArtist = track.artist;
      this.shownStation = track.station;
      this.shownState = group.state;
      this.nameLabel.text = group.name();
      const trackLine =
        track.title !== ''
          ? track.title + (track.artist !== '' ? ' · ' + track.artist : '')
          : track.station;
      const statusPrefix = group.playing()
        ? ''
        : group.state === 'PAUSED_PLAYBACK'
        ? 'En pause · '
        : 'Arrêté · ';
      this.trackLabel.text = statusPrefix + trackLine;
    }

    this.groupVolumeSlider.normalizedValue = group.volume >= 0 ? group.volume / 100 : 0;
    this.groupVolumeLabel.showVolume(group.volume);
    for (let memberIndex = 0; memberIndex < this.memberRows.length; memberIndex++) {
      this.memberRows[memberIndex].showSpeaker(group.members[memberIndex]);
    }
  }
}

/** A checkbox row that adds a room to the controlled group or takes it out. */
class SpeakerGroupCheckRowNode extends HBox {
  readonly speakerUuid: string;
  speaker: Speaker = new Speaker();
  isMemberOfGroup: boolean = false;
  isCoordinator: boolean = false;
  readonly speakerNameLabel: LabelNode;
  readonly zoneId: string;

  constructor(speakerUuid: string) {
    super(16, 'SpeakerGroupCheckRow');
    this.speakerUuid = speakerUuid;
    this.zoneId = 'group/' + speakerUuid;
    this.height = 55;
    this.autoHeight = false;
    this.paddingLeft = 56;
    this.paddingRight = 20;

    this.speakerNameLabel = new LabelNode(Fonts.label, '', COLOR_TEXT_PRIMARY, 22);
    this.speakerNameLabel.flex = 1;
    this.addChild(this.speakerNameLabel);
  }

  showSpeaker(speaker: Speaker, activeGroup: Group): void {
    this.speaker = speaker;
    this.isMemberOfGroup = speaker.coordinator === activeGroup.coordinator.uuid;
    this.isCoordinator = speaker.uuid === activeGroup.coordinator.uuid;
    this.speakerNameLabel.text = speaker.name;
    this.speakerNameLabel.color = this.isCoordinator ? COLOR_TEXT_SECONDARY : COLOR_TEXT_PRIMARY;
  }

  private toggleMembership(): void {
    if (appState.sonosSystem === null || appState.activeGroup === null) return;
    const system = appState.sonosSystem as System;
    const activeGroup = appState.activeGroup as Group;
    const speaker = this.speaker;
    const isMember = this.isMemberOfGroup;
    runSafeNetworkAction('Regroupement', async (): Promise<void> => {
      if (isMember) {
        await system.leave(speaker);
      } else {
        await system.join(speaker, activeGroup);
      }
      await sleepMilliseconds(800);
      await pollSonosTopology();
      await pollAllRoomVolumes();
    });
  }

  override onDraw(localWidth: number, localHeight: number): void {
    if (this.isMemberOfGroup) {
      rrect(16, 16, 24, 24, 12, this.isCoordinator ? COLOR_TEXT_TERTIARY : COLOR_ACCENT, 255);
      drawGlyph('check', 20, 20, 16, COLOR_TEXT_PRIMARY, 255, 3);
    } else {
      rrect(16, 16, 24, 24, 12, COLOR_TEXT_TERTIARY, 255);
      rrect(18, 18, 20, 20, 10, COLOR_CARD, 255);
    }
    if (!this.isCoordinator) {
      registerTapZone(this.zoneId, 0, 0, localWidth, localHeight, () => this.toggleMembership());
    }
  }
}

export class RoomsPageNode extends DisplayObject {
  readonly headerBar: PageHeaderBarNode;
  readonly refreshButtonNode: PillButtonNode;
  readonly scrollContainer: ScrollContainerNode;

  // The tree built for the current topology
  private groupCards: GroupCardNode[] = [];
  private checkRows: SpeakerGroupCheckRowNode[] = [];
  private groupingTitleLabel: LabelNode | null = null;
  private builtForActiveGroup: Group | null = null;

  constructor() {
    super('RoomsPage');

    this.headerBar = new PageHeaderBarNode('Enceintes', 14);
    this.refreshButtonNode = new PillButtonNode('rooms/refresh', 'Actualiser', 'refresh-cw', () => {
      pollSonosTopology();
      pollAllRoomVolumes();
    });
    this.headerBar.addChild(this.refreshButtonNode);

    this.scrollContainer = new ScrollContainerNode(appState.pageScrollBoxes[PAGE_ROOMS], 20, 'RoomsScroll');
    this.scrollContainer.y = 96;
    this.scrollContainer.contentBox.setPaddingSymmetric(PAGE_PADDING, 8);
    this.scrollContainer.contentBox.paddingBottom = 28;

    this.addChild(this.headerBar);
    this.addChild(this.scrollContainer);
  }

  override onAddedToStage(): void {
    pollAllRoomVolumes();
  }

  override onMeasure(): void {
    const sidebarWidth = appState.sidebarWidth;
    const pageWidth = this.width > 0 ? this.width : 1024;
    const pageHeight = this.height > 0 ? this.height : 738;

    this.headerBar.x = sidebarWidth;
    this.headerBar.width = pageWidth - sidebarWidth;
    this.headerBar.setPaddingSymmetric(PAGE_PADDING, 0);

    const hasSystem = appState.sonosSystem !== null;
    this.refreshButtonNode.visible = hasSystem;
    this.scrollContainer.visible = hasSystem;
    if (!hasSystem) return;

    this.scrollContainer.x = sidebarWidth;
    this.scrollContainer.y = 96;
    this.scrollContainer.width = pageWidth - sidebarWidth;
    this.scrollContainer.height = pageHeight - 96;

    const system = appState.sonosSystem as System;
    if (!this.matchesTopology(system)) {
      this.buildRoomsTree(system);
    }
    this.showValues(system);
  }

  /** True when the tree was built for these groups, rooms and controlled group: no node to add or remove. */
  private matchesTopology(system: System): boolean {
    if (
      this.builtForActiveGroup !== appState.activeGroup ||
      this.groupCards.length !== system.groups.length ||
      this.checkRows.length !== (appState.activeGroup !== null ? system.speakers.length : 0)
    ) {
      return false;
    }
    for (let groupIndex = 0; groupIndex < system.groups.length; groupIndex++) {
      if (!this.groupCards[groupIndex].matchesGroup(system.groups[groupIndex])) return false;
    }
    for (let speakerIndex = 0; speakerIndex < this.checkRows.length; speakerIndex++) {
      if (this.checkRows[speakerIndex].speakerUuid !== system.speakers[speakerIndex].uuid) return false;
    }
    return true;
  }

  private buildRoomsTree(system: System): void {
    const contentBox = this.scrollContainer.contentBox;
    contentBox.removeChildren();
    this.groupCards = [];
    this.checkRows = [];
    this.groupingTitleLabel = null;
    this.builtForActiveGroup = appState.activeGroup;

    for (let groupIndex = 0; groupIndex < system.groups.length; groupIndex++) {
      const groupCard = new GroupCardNode(system.groups[groupIndex]);
      this.groupCards.push(groupCard);
      contentBox.addChild(groupCard);
    }

    // The rooms that can join the controlled group
    if (appState.activeGroup === null) return;
    const groupingSection = new VBox(10, 'GroupingSection');
    const sectionHeader = new HBox(0, 'GroupingHeader');
    sectionHeader.height = 24;
    sectionHeader.autoHeight = false;
    sectionHeader.paddingLeft = 4;
    const groupingTitleLabel = new LabelNode(Fonts.tinyBold, '', COLOR_TEXT_SECONDARY, 16);
    sectionHeader.addChild(groupingTitleLabel);
    this.groupingTitleLabel = groupingTitleLabel;
    groupingSection.addChild(sectionHeader);

    const checklistCard = new CardBox('column', system.speakers.length * 56, 'GroupingChecklistCard');
    checklistCard.cornerRadius = 16;
    for (let speakerIndex = 0; speakerIndex < system.speakers.length; speakerIndex++) {
      if (speakerIndex > 0) {
        checklistCard.addChild(new SeparatorNode(56, 0));
      }
      const checkRow = new SpeakerGroupCheckRowNode(system.speakers[speakerIndex].uuid);
      this.checkRows.push(checkRow);
      checklistCard.addChild(checkRow);
    }
    groupingSection.addChild(checklistCard);
    contentBox.addChild(groupingSection);
  }

  private showValues(system: System): void {
    for (let groupIndex = 0; groupIndex < this.groupCards.length; groupIndex++) {
      const group = system.groups[groupIndex];
      this.groupCards[groupIndex].showGroup(group, group === appState.activeGroup);
    }
    if (appState.activeGroup === null) return;
    const activeGroup = appState.activeGroup as Group;
    if (this.groupingTitleLabel !== null && (this.groupingTitleLabel as LabelNode).text === '') {
      (this.groupingTitleLabel as LabelNode).text = ('Regrouper avec ' + activeGroup.coordinator.name).toUpperCase();
    }
    for (let speakerIndex = 0; speakerIndex < this.checkRows.length; speakerIndex++) {
      this.checkRows[speakerIndex].showSpeaker(system.speakers[speakerIndex], activeGroup);
    }
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    if (appState.sonosSystem === null) {
      drawNoSpeakerEmptyState(viewWidth, viewHeight);
    }
  }
}
