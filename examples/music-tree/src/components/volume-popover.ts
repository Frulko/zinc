// ============================================================================
// components/volume-popover.ts — Popover des volumes (construit en arbre Flexbox)
// ============================================================================
// S'ouvre au-dessus du curseur de volume du lecteur lorsqu'un groupe comporte
// plusieurs enceintes. Utilise une `CardBox('column')` Flexbox où chaque ligne
// empile une `HBox` (nom + `SpacerNode` + valeur) et un `SliderNode` étiré.

import { shadow } from 'zinc:gfx';
import { Group, Speaker } from 'zinc:sonos';
import {
  COLOR_ACCENT,
  COLOR_CARD_ELEVATED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
} from '../constants';
import { Fonts } from '../fonts';
import { DisplayObject } from '../core/display';
import { registerTapZone } from '../core/input';
import {
  CardBox,
  HBox,
  LabelNode,
  SliderNode,
  SpacerNode,
  VBox,
} from './layout-nodes';
import {
  appState,
  setActiveGroupVolume,
  setSpeakerRoomVolume,
} from '../state';

/**
 * Une ligne de volume (titre + pourcentage + curseur) à l'intérieur du popover.
 */
class VolumePopoverRowNode extends VBox {
  readonly titleLabel: LabelNode;
  readonly valueLabel: LabelNode;
  readonly sliderNode: SliderNode;

  constructor(rowIndex: i32) {
    super(8, `VolumePopoverRow_${rowIndex}`);
    this.height = 52;
    this.autoHeight = false;

    const topRow = new HBox(8, 'RowHeader');
    topRow.height = 20;
    topRow.autoHeight = false;

    this.titleLabel = new LabelNode(
      rowIndex === 0 ? Fonts.smallBold : Fonts.small,
      '',
      COLOR_TEXT_PRIMARY,
      20
    );
    this.valueLabel = new LabelNode(Fonts.smallBold, '', COLOR_TEXT_SECONDARY, 20);

    topRow.addChild(this.titleLabel);
    topRow.addChild(new SpacerNode(1));
    topRow.addChild(this.valueLabel);

    this.sliderNode = new SliderNode(
      rowIndex === 0 ? 'vol/pg' : `vol/p/${rowIndex}`,
      rowIndex === 0 ? COLOR_ACCENT : 0xffffff,
      () => {},
      6
    );

    this.addChild(topRow);
    this.addChild(this.sliderNode);
  }
}

export class VolumePopoverNode extends DisplayObject {
  readonly cardBox: CardBox;
  private rowNodes: VolumePopoverRowNode[] = [];

  constructor() {
    super('VolumePopover');
    this.cardBox = new CardBox('column', 0, 'VolumePopoverCard');
    this.cardBox.autoHeight = true;
    this.cardBox.width = 460;
    this.cardBox.cornerRadius = 18;
    this.cardBox.backgroundColor = COLOR_CARD_ELEVATED;
    this.cardBox.backgroundAlpha = 250;
    this.cardBox.setPaddingSymmetric(22, 18);
    this.cardBox.gap = 12;
    this.addChild(this.cardBox);
  }

  override onMeasure(): void {
    const isVisible = appState.isVolumePopoverOpen && appState.activeGroup !== null;
    this.cardBox.visible = isVisible;
    if (!isVisible) return;

    const group = appState.activeGroup as Group;
    const totalRowsCount = group.members.length + 1;

    // Ajuste le nombre de lignes enfants dans la CardBox
    while (this.rowNodes.length < totalRowsCount) {
      const newRow = new VolumePopoverRowNode(this.rowNodes.length as i32);
      this.rowNodes.push(newRow);
      this.cardBox.addChild(newRow);
    }
    for (let index = 0; index < this.rowNodes.length; index++) {
      this.rowNodes[index].visible = index < totalRowsCount;
    }

    for (let rowIndex = 0; rowIndex < totalRowsCount; rowIndex++) {
      const rowNode = this.rowNodes[rowIndex];
      const memberSpeaker = rowIndex === 0 ? null : group.members[rowIndex - 1];
      const volumeValue =
        memberSpeaker === null ? group.volume : (memberSpeaker as Speaker).volume;

      rowNode.titleLabel.text =
        memberSpeaker === null ? 'Tout le groupe' : (memberSpeaker as Speaker).name;
      rowNode.valueLabel.text = volumeValue >= 0 ? '' + volumeValue : '–';
      rowNode.sliderNode.normalizedValue = volumeValue >= 0 ? volumeValue / 100 : 0;

      if (memberSpeaker === null) {
        rowNode.sliderNode.zoneId = 'vol/pg';
        rowNode.sliderNode.fillColor = COLOR_ACCENT;
        rowNode.sliderNode.onChange = (newValue: number, isReleased: boolean) => {
          appState.volumePopoverRemainingSeconds = 4;
          setActiveGroupVolume(newValue);
        };
      } else {
        const targetSpeaker = memberSpeaker as Speaker;
        rowNode.sliderNode.zoneId = 'vol/p/' + targetSpeaker.uuid;
        rowNode.sliderNode.fillColor = 0xffffff;
        rowNode.sliderNode.onChange = (newValue: number, isReleased: boolean) => {
          appState.volumePopoverRemainingSeconds = 4;
          setSpeakerRoomVolume(targetSpeaker, newValue);
        };
      }
    }

    const estimatedCardHeight = 26 + totalRowsCount * 64;
    this.cardBox.x = appState.volumeBarScreenX;
    this.cardBox.y = appState.volumeBarScreenY - 30 - estimatedCardHeight;
  }

  override onDraw(stageWidth: number, stageHeight: number): void {
    if (!appState.isVolumePopoverOpen || appState.activeGroup === null) return;

    registerTapZone('vol/veil', 0, 0, stageWidth, stageHeight, () => {
      appState.isVolumePopoverOpen = false;
    });

    // Ombre portée sous la CardBox et zone tactile pour maintenir le popover ouvert
    shadow(
      this.cardBox.x,
      this.cardBox.y + 10,
      this.cardBox.width,
      this.cardBox.height,
      18,
      30,
      0x000000,
      150
    );
    registerTapZone(
      'vol/card',
      this.cardBox.x,
      this.cardBox.y,
      this.cardBox.width,
      this.cardBox.height,
      () => {
        appState.volumePopoverRemainingSeconds = 4;
      }
    );
  }
}
