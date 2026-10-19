// ============================================================================
// pages/home/home-page.ts — Home page, container of the carousel (5 slides)
// ============================================================================
// In the display-tree architecture (AS3/Haxe style), `HomePageNode` is
// a container that owns 5 `DisplayObject` children:
// 0. `PlayerSlideNode`        (Player + sidebar)
// 1. `ClockSlideNode`         (StandBy clock with 5 faces)
// 2. `WeatherSlideNode`       (Open-Meteo weather)
// 3. `VolumesRingsSlideNode`  (Volume rings of the rooms)
// 4. `NotificationsSlideNode` (macOS notification center)
//
// On each render, `HomePageNode` draws the blurred atmospheric background of the
// cover, then updates the `.x` abscissa and the `.visible` flag of its
// 5 children according to the carousel position `appState.animatedSlideX`.

import { rrect, gradient } from 'zinc:gfx';
import { Group } from 'zinc:sonos';
import { SLIDE_COUNT, STATUS_BAR_HEIGHT } from '../../constants';
import { DisplayObject } from '../../core/display';
import { drawBlurredBackdrop } from '../../core/pictures';
import { appState, getGroupArtworkUrl } from '../../state';
import { PlayerSlideNode } from './player-slide';
import { ClockSlideNode } from './clock-slide';
import { WeatherSlideNode } from './weather-slide';
import { VolumesRingsSlideNode } from './rings-slide';
import { NotificationsSlideNode } from './notifications-slide';

export class HomePageNode extends DisplayObject {
  readonly playerSlide: PlayerSlideNode;
  readonly clockSlide: ClockSlideNode;
  readonly weatherSlide: WeatherSlideNode;
  readonly ringsSlide: VolumesRingsSlideNode;
  readonly notificationsSlide: NotificationsSlideNode;
  private readonly slideNodes: DisplayObject[];

  constructor() {
    super('HomePage');
    this.playerSlide = new PlayerSlideNode();
    this.clockSlide = new ClockSlideNode();
    this.weatherSlide = new WeatherSlideNode();
    this.ringsSlide = new VolumesRingsSlideNode();
    this.notificationsSlide = new NotificationsSlideNode();

    this.slideNodes = [
      this.playerSlide,
      this.clockSlide,
      this.weatherSlide,
      this.ringsSlide,
      this.notificationsSlide,
    ];

    for (let index = 0; index < this.slideNodes.length; index++) {
      this.addChild(this.slideNodes[index]);
    }
  }

  override onDraw(screenWidth: number, contentHeight: number): void {
    const fullScreenHeight = contentHeight + STATUS_BAR_HEIGHT;

    // The blurred background covers the whole screen (including under the status bar at y = -STATUS_BAR_HEIGHT)
    const artworkUrl =
      appState.activeGroup !== null
        ? getGroupArtworkUrl(appState.activeGroup as Group)
        : '';
    if (artworkUrl !== '' && drawBlurredBackdrop(artworkUrl, screenWidth, fullScreenHeight)) {
      rrect(0, -STATUS_BAR_HEIGHT, screenWidth, fullScreenHeight, 0, 0x000000, 110);
    } else {
      gradient(
        0,
        -STATUS_BAR_HEIGHT,
        screenWidth,
        fullScreenHeight,
        0,
        0x2c2c2e,
        0x000000,
        true,
        255
      );
    }

    // Progressive darkening to black when swiping towards the StandBy slides (1..4)
    const nightTransition = Math.max(0, Math.min(1, appState.animatedSlideX));
    if (nightTransition > 0) {
      rrect(
        0,
        -STATUS_BAR_HEIGHT,
        screenWidth,
        fullScreenHeight,
        0,
        0x000000,
        Math.round(nightTransition * 255) as i32
      );
    }

    // Horizontal positioning and activation of the slides visible in the tree
    for (let slideIndex: i32 = 0; slideIndex < SLIDE_COUNT; slideIndex++) {
      const horizontalOffset = Math.round(
        (slideIndex - appState.animatedSlideX) * screenWidth
      );
      const slideNode = this.slideNodes[slideIndex];
      slideNode.x = horizontalOffset;
      slideNode.y = 0;
      slideNode.width = screenWidth;
      slideNode.height = contentHeight;
      slideNode.visible = Math.abs(horizontalOffset) < screenWidth;
    }
  }
}
