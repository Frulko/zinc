// ============================================================================
// pages/home/home-page.ts — Page d'accueil conteneur du carrousel (5 slides)
// ============================================================================
// Dans l'architecture d'arbre d'affichage (façon AS3/Haxe), `HomePageNode` est
// un conteneur qui possède 5 enfants `DisplayObject` :
// 0. `PlayerSlideNode`        (Lecteur + Barre latérale)
// 1. `ClockSlideNode`         (Horloge StandBy à 5 cadrans)
// 2. `WeatherSlideNode`       (Météo Open-Meteo)
// 3. `VolumesRingsSlideNode`  (Anneaux de volume des pièces)
// 4. `NotificationsSlideNode` (Centre de notifications macOS)
//
// À chaque rendu, `HomePageNode` dessine le fond atmosphérique flouté de la
// pochette, puis met à jour l'abscisse `.x` et la visibilité `.visible` de ses
// 5 enfants selon la position du carrousel `appState.animatedSlideX`.

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

    // Le fond flouté couvre tout l'écran (y compris sous la barre d'état en y = -STATUS_BAR_HEIGHT)
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

    // Assombrissement progressif vers le noir lorsqu'on glisse vers les slides StandBy (1..4)
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

    // Positionnement horizontal et activation des slides visibles dans l'arbre
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
