// ============================================================================
// pages/rooms/rooms-page.ts — Page Enceintes (construite en arbre Flexbox)
// ============================================================================
// Cette page assemble ses cartes de groupes Sonos, ses curseurs de volume par
// pièce et sa liste de regroupement à l'aide des conteneurs Flexbox (`ScrollContainerNode`,
// `VBox`, `HBox`, `CardBox`, `CoverArtNode`, `LabelNode`, `PillButtonNode`,
// `IconButtonNode`, `SliderNode`, `SeparatorNode`).

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
import { DisplayObject } from '../../core/display';
import { isZonePressed, registerTapZone } from '../../core/input';
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

/**
 * Ligne d'en-tête interactive d'une carte de groupe Sonos.
 */
class GroupHeaderRowNode extends HBox {
  groupId: string = '';
  isControlledGroup: boolean = false;
  totalCardHeight: number = 76;
  onTapSelectAndGoHome: () => void = () => {};

  constructor() {
    super(14, 'GroupHeaderRow');
    this.height = 76;
    this.autoHeight = false;
    this.setPaddingSymmetric(18, 0);
  }

  override onDraw(localWidth: number, localHeight: number): void {
    if (this.isControlledGroup) {
      rrect(0, 0, 4, this.totalCardHeight, 2, COLOR_ACCENT, 255);
    }
    const headerZoneId = 'room/g/' + this.groupId;
    if (isZonePressed(headerZoneId)) {
      rrect(0, 0, localWidth, 72, 16, 0xffffff, 15);
    }
    registerTapZone(headerZoneId, 0, 0, localWidth - 160, 72, this.onTapSelectAndGoHome);
  }
}

/**
 * Ligne de case à cocher pour associer ou dissocier une pièce du groupe actif.
 */
class SpeakerGroupCheckRowNode extends HBox {
  speakerUuid: string = '';
  isMemberOfGroup: boolean = false;
  isCoordinator: boolean = false;
  readonly speakerNameLabel: LabelNode;
  onToggleSpeaker: () => void = () => {};

  constructor() {
    super(16, 'SpeakerGroupCheckRow');
    this.height = 55;
    this.autoHeight = false;
    this.paddingLeft = 56;
    this.paddingRight = 20;

    this.speakerNameLabel = new LabelNode(Fonts.label, '', COLOR_TEXT_PRIMARY, 22);
    this.speakerNameLabel.flex = 1;
    this.addChild(this.speakerNameLabel);
  }

  override onDraw(localWidth: number, localHeight: number): void {
    if (this.isMemberOfGroup) {
      rrect(
        16,
        16,
        24,
        24,
        12,
        this.isCoordinator ? COLOR_TEXT_TERTIARY : COLOR_ACCENT,
        255
      );
      drawGlyph('check', 20, 20, 16, COLOR_TEXT_PRIMARY, 255, 3);
    } else {
      rrect(16, 16, 24, 24, 12, COLOR_TEXT_TERTIARY, 255);
      rrect(18, 18, 20, 20, 10, COLOR_CARD, 255);
    }

    if (!this.isCoordinator) {
      registerTapZone(
        'group/' + this.speakerUuid,
        0,
        0,
        localWidth,
        localHeight,
        this.onToggleSpeaker
      );
    }
  }
}

export class RoomsPageNode extends DisplayObject {
  readonly headerBar: PageHeaderBarNode;
  readonly refreshButtonNode: PillButtonNode;
  readonly scrollContainer: ScrollContainerNode;

  private lastTopologySignature: string = '';

  constructor() {
    super('RoomsPage');

    this.headerBar = new PageHeaderBarNode('Enceintes', 14);
    this.refreshButtonNode = new PillButtonNode(
      'rooms/refresh',
      'Actualiser',
      'refresh-cw',
      () => {
        pollSonosTopology();
        pollAllRoomVolumes();
      }
    );
    this.headerBar.addChild(this.refreshButtonNode);

    this.scrollContainer = new ScrollContainerNode(
      appState.pageScrollBoxes[PAGE_ROOMS],
      20,
      'RoomsScroll'
    );
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

    this.rebuildRoomsTree(appState.sonosSystem as System);
  }

  private rebuildRoomsTree(system: System): void {
    const contentBox = this.scrollContainer.contentBox;
    contentBox.removeChildren();

    for (let groupIndex = 0; groupIndex < system.groups.length; groupIndex++) {
      const group = system.groups[groupIndex];
      const capturedGroup = group;
      const isControlledGroup = group === appState.activeGroup;
      const totalCardHeight =
        76 + group.members.length * 60 + (group.members.length > 1 ? 60 : 0);

      const groupCard = new CardBox('column', totalCardHeight, `GroupCard_${group.id}`);
      groupCard.cornerRadius = 16;

      // En-tête du groupe (Pochette + Nom/Piste + Badge ou bouton Contrôler)
      const headerRow = new GroupHeaderRowNode();
      headerRow.groupId = group.id;
      headerRow.isControlledGroup = isControlledGroup;
      headerRow.totalCardHeight = totalCardHeight;
      headerRow.onTapSelectAndGoHome = () => {
        selectActiveSonosGroup(capturedGroup);
        navigateToHomePlayer();
      };

      const coverNode = new CoverArtNode(48, 8);
      coverNode.imageUrl = getGroupArtworkUrl(group);
      coverNode.title =
        group.track.title !== '' ? group.track.title : group.track.station;
      headerRow.addChild(coverNode);

      const titlesColumn = new VBox(4, 'GroupTitles');
      titlesColumn.flex = 1;
      titlesColumn.addChild(
        new LabelNode(Fonts.bodyBold, group.name(), COLOR_TEXT_PRIMARY, 22)
      );

      const trackLine =
        group.track.title !== ''
          ? group.track.title +
            (group.track.artist !== '' ? ' · ' + group.track.artist : '')
          : group.track.station;
      const statusPrefix = group.playing()
        ? ''
        : group.state === 'PAUSED_PLAYBACK'
        ? 'En pause · '
        : 'Arrêté · ';
      titlesColumn.addChild(
        new LabelNode(
          Fonts.small,
          statusPrefix + trackLine,
          COLOR_TEXT_SECONDARY,
          20
        )
      );
      headerRow.addChild(titlesColumn);

      if (isControlledGroup) {
        headerRow.addChild(
          new LabelNode(Fonts.tinyBold, 'CONTRÔLÉ', COLOR_ACCENT, 18)
        );
      } else {
        headerRow.addChild(
          new PillButtonNode(
            'room/sel/' + group.id,
            'Contrôler',
            '',
            () => selectActiveSonosGroup(capturedGroup)
          )
        );
      }
      groupCard.addChild(headerRow);

      // Curseur de volume général du groupe (si plusieurs pièces)
      if (group.members.length > 1) {
        groupCard.addChild(new SeparatorNode(18, 18));
        const groupVolRow = new HBox(14, 'GroupVolumeRow');
        groupVolRow.height = 59;
        groupVolRow.autoHeight = false;
        groupVolRow.setPaddingSymmetric(18, 0);

        const groupLabel = new LabelNode(
          Fonts.smallBold,
          'Groupe',
          COLOR_TEXT_PRIMARY,
          20
        );
        groupLabel.fixedWidth = 168;
        groupVolRow.addChild(groupLabel);

        const groupSlider = new SliderNode(
          'room/gv/' + group.id,
          COLOR_ACCENT,
          (newValue: number, isReleased: boolean) =>
            setSpecificGroupVolume(capturedGroup, newValue)
        );
        groupSlider.flex = 1;
        groupSlider.normalizedValue = group.volume >= 0 ? group.volume / 100 : 0;
        groupVolRow.addChild(groupSlider);

        const groupVolValueLabel = new LabelNode(
          Fonts.smallBold,
          group.volume >= 0 ? '' + group.volume : '–',
          COLOR_TEXT_SECONDARY,
          20
        );
        groupVolValueLabel.fixedWidth = 42;
        groupVolRow.addChild(groupVolValueLabel);
        groupCard.addChild(groupVolRow);
      }

      // Curseur de volume et bouton muet pour chaque pièce membre
      for (let memberIndex = 0; memberIndex < group.members.length; memberIndex++) {
        const speaker = group.members[memberIndex];
        groupCard.addChild(new SeparatorNode(18, 18));

        const memberRow = new HBox(10, `MemberRow_${speaker.uuid}`);
        memberRow.height = 59;
        memberRow.autoHeight = false;
        memberRow.setPaddingSymmetric(18, 0);

        const memberNameLabel = new LabelNode(
          Fonts.label,
          speaker.name,
          COLOR_TEXT_PRIMARY,
          22
        );
        memberNameLabel.fixedWidth = 132;
        memberRow.addChild(memberNameLabel);

        const muteButton = new IconButtonNode(
          'room/mute/' + speaker.uuid,
          speaker.muted ? 'volume-x' : 'volume-2',
          20,
          speaker.muted ? COLOR_ACCENT : COLOR_TEXT_SECONDARY,
          () =>
            runSafeNetworkAction('Muet', async (): Promise<void> => {
              await system.setMute(speaker, !speaker.muted);
            }),
          32
        );
        memberRow.addChild(muteButton);

        const memberSlider = new SliderNode(
          'room/v/' + speaker.uuid,
          0xffffff,
          (newValue: number, isReleased: boolean) =>
            setSpeakerRoomVolume(speaker, newValue)
        );
        memberSlider.flex = 1;
        memberSlider.normalizedValue =
          speaker.volume >= 0 ? speaker.volume / 100 : 0;
        memberRow.addChild(memberSlider);

        const memberVolValueLabel = new LabelNode(
          Fonts.smallBold,
          speaker.volume >= 0 ? '' + speaker.volume : '–',
          COLOR_TEXT_SECONDARY,
          20
        );
        memberVolValueLabel.fixedWidth = 42;
        memberRow.addChild(memberVolValueLabel);
        groupCard.addChild(memberRow);
      }

      contentBox.addChild(groupCard);
    }

    // Section de regroupement avec le coordinateur actif
    if (appState.activeGroup !== null) {
      const activeGroup = appState.activeGroup as Group;
      const groupingSection = new VBox(10, 'GroupingSection');

      const sectionHeader = new HBox(0, 'GroupingHeader');
      sectionHeader.height = 24;
      sectionHeader.autoHeight = false;
      sectionHeader.paddingLeft = 4;
      sectionHeader.addChild(
        new LabelNode(
          Fonts.tinyBold,
          ('Regrouper avec ' + activeGroup.coordinator.name).toUpperCase(),
          COLOR_TEXT_SECONDARY,
          16
        )
      );
      groupingSection.addChild(sectionHeader);

      const checklistCard = new CardBox(
        'column',
        system.speakers.length * 56,
        'GroupingChecklistCard'
      );
      checklistCard.cornerRadius = 16;

      for (let speakerIndex = 0; speakerIndex < system.speakers.length; speakerIndex++) {
        const speaker = system.speakers[speakerIndex];
        const isMember = speaker.coordinator === activeGroup.coordinator.uuid;
        const isCoordinator = speaker.uuid === activeGroup.coordinator.uuid;

        if (speakerIndex > 0) {
          checklistCard.addChild(new SeparatorNode(56, 0));
        }

        const checkRow = new SpeakerGroupCheckRowNode();
        checkRow.speakerUuid = speaker.uuid;
        checkRow.isMemberOfGroup = isMember;
        checkRow.isCoordinator = isCoordinator;
        checkRow.speakerNameLabel.text = speaker.name;
        checkRow.speakerNameLabel.color = isCoordinator
          ? COLOR_TEXT_SECONDARY
          : COLOR_TEXT_PRIMARY;
        checkRow.onToggleSpeaker = () =>
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
        checklistCard.addChild(checkRow);
      }

      groupingSection.addChild(checklistCard);
      contentBox.addChild(groupingSection);
    }
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    if (appState.sonosSystem === null) {
      drawNoSpeakerEmptyState(viewWidth, viewHeight);
    }
  }
}
