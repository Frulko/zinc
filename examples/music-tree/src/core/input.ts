// ============================================================================
// core/input.ts — Gestion des zones tactiles, du glisser et du défilement
// ============================================================================
// Comme l'écran n'est redessiné que lorsque quelque chose change (`uiState.dirty`),
// chaque composant enregistre ses zones interactives (`TouchZone`) pendant son
// dessin `onDraw()`. Le gestionnaire d'entrées teste ensuite les coordonnées du
// doigt ou de la souris du dernier élément dessiné vers le premier (ordre Z).

import { clip, unclip } from 'zinc:gfx';

/**
 * État global du rendu et du pointeur partagé par l'arbre d'affichage.
 */
export class UiRenderState {
  /** Indique qu'au moins un élément a changé et que la scène doit être redessinée. */
  dirty: boolean = true;

  /** Coordonnée X actuelle du pointeur pour la frame en cours. */
  pointerX: number = 0;

  /** Coordonnée Y actuelle du pointeur pour la frame en cours. */
  pointerY: number = 0;

  /** Identifiant de la zone actuellement maintenue sous le doigt ('' si aucune). */
  pressedZoneId: string = '';

  /** Décalage X courant injecté par le DisplayObject en cours de dessin. */
  offsetX: number = 0;

  /** Décalage Y courant injecté par le DisplayObject en cours de dessin. */
  offsetY: number = 0;

  /** Mis à `true` par un composant animé (spinner, fondu d'image, lampe à lave) pour demander la frame suivante. */
  animating: boolean = false;
}

export const uiState = new UiRenderState();

/**
 * État d'une liste déroulante verticale avec défilement inertiel (physique de lancer).
 */
export class ScrollBox {
  /** Position verticale actuelle du défilement (en pixels). */
  scrollY: number = 0;

  /** Hauteur totale du contenu mesurée lors du dessin. */
  contentHeight: number = 0;

  /** Hauteur visible de la fenêtre de découpe (viewport). */
  viewportHeight: number = 0;

  /** Vitesse actuelle du défilement inertiel (en pixels par seconde). */
  velocityY: number = 0;

  /** Valeur maximale que peut prendre `scrollY`. */
  maxScrollY(): number {
    return Math.max(0, this.contentHeight - this.viewportHeight);
  }

  /** Contraint `scrollY` dans les bornes `[0, maxScrollY()]`. */
  clamp(): void {
    this.scrollY = Math.max(0, Math.min(this.maxScrollY(), this.scrollY));
  }

  /**
   * Fait avancer l'inertie après un lancer du doigt.
   * Retourne `true` tant que la liste est en mouvement.
   */
  stepInertia(deltaSeconds: number): boolean {
    if (Math.abs(this.velocityY) < 8) {
      this.velocityY = 0;
      return false;
    }
    this.scrollY += this.velocityY * deltaSeconds;
    this.velocityY *= Math.pow(0.04, deltaSeconds);
    if (this.scrollY < 0 || this.scrollY > this.maxScrollY()) {
      this.clamp();
      this.velocityY = 0;
    }
    return true;
  }
}

/**
 * Une zone interactive rectangulaire enregistrée pendant le rendu d'un composant.
 */
export class TouchZone {
  id: string = '';
  x: number = 0;
  y: number = 0;
  width: number = 0;
  height: number = 0;

  /** Action déclenchée lors d'un appui court (tap) sans déplacement. */
  onTapCallback: (() => void) | null = null;

  /**
   * Action déclenchée lors d'un glisser (curseur de volume, balayage d'une ligne).
   * `phase` vaut : 0 = appui initial, 1 = mouvement, 2 = relâchement, 3 = annulé au profit du carrousel.
   */
  onDragCallback: ((localX: number, localY: number, phase: i32) => void) | null = null;

  /** Zone de défilement associée si cette zone est un conteneur scrollable. */
  scrollBox: ScrollBox | null = null;

  /** Vérifie si le point écran `(pointX, pointY)` se trouve dans ce rectangle. */
  containsPoint(pointX: number, pointY: number): boolean {
    return (
      pointX >= this.x &&
      pointX < this.x + this.width &&
      pointY >= this.y &&
      pointY < this.y + this.height
    );
  }
}

/**
 * The screen rectangle of the scroll box being drawn (between `beginScrollBox` and `endScrollBox`): the zones registered
 * inside are cut to it, so a row scrolled under a header takes no tap, and what lies outside need not be drawn.
 */
let isScrollClipOpen = false;
let scrollClipLeft = 0;
let scrollClipTop = 0;
let scrollClipRight = 0;
let scrollClipBottom = 0;

/** False when the local rectangle lies wholly outside the scroll box being drawn (always true outside a scroll box). */
export function isLocalRectVisible(x: number, y: number, width: number, height: number): boolean {
  if (!isScrollClipOpen) return true;
  const left = x + uiState.offsetX;
  const top = y + uiState.offsetY;
  return left < scrollClipRight && left + width > scrollClipLeft && top < scrollClipBottom && top + height > scrollClipTop;
}

/** Cuts a zone in screen coordinates to the scroll box being drawn; false when nothing of it is left. */
function clipZoneToScrollBox(zone: TouchZone): boolean {
  if (!isScrollClipOpen) return true;
  const right = Math.min(zone.x + zone.width, scrollClipRight);
  const bottom = Math.min(zone.y + zone.height, scrollClipBottom);
  zone.x = Math.max(zone.x, scrollClipLeft);
  zone.y = Math.max(zone.y, scrollClipTop);
  zone.width = right - zone.x;
  zone.height = bottom - zone.y;
  return zone.width > 0 && zone.height > 0;
}

/** Liste des zones interactives collectées lors du dernier rendu de l'arbre. */
export let activeZones: TouchZone[] = [];

/** Takes the zones of the frame on the screen out of the list, for a drawing whose zones must not count (the offscreen warm-up). */
export function takeTouchZones(): TouchZone[] {
  const zones = activeZones;
  activeZones = [];
  return zones;
}

/** Puts back the zones taken by `takeTouchZones`, dropping the ones registered since. */
export function restoreTouchZones(zones: TouchZone[]): void {
  activeZones = zones;
}

/** Vide les zones au début d'un nouveau rendu de la scène. */
export function clearTouchZones(): void {
  activeZones = [];
}

/**
 * Enregistre une zone de clic/tap aux coordonnées locales `(x, y, width, height)`.
 * Le décalage global du `DisplayObject` courant (`uiState.offsetX/Y`) est ajouté automatiquement.
 */
export function registerTapZone(
  zoneId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  onTapCallback: () => void
): void {
  const zone = new TouchZone();
  zone.id = zoneId;
  zone.x = x + uiState.offsetX;
  zone.y = y + uiState.offsetY;
  zone.width = width;
  zone.height = height;
  zone.onTapCallback = onTapCallback;
  if (clipZoneToScrollBox(zone)) activeZones.push(zone);
}

/**
 * Enregistre une zone de glisser (drag) aux coordonnées locales `(x, y, width, height)`.
 * Les coordonnées passées au callback sont automatiquement ramenées dans le repère local du composant.
 */
export function registerDragZone(
  zoneId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  onDragCallback: (localX: number, localY: number, phase: i32) => void
): void {
  const capturedOffsetX = uiState.offsetX;
  const capturedOffsetY = uiState.offsetY;
  const zone = new TouchZone();
  zone.id = zoneId;
  zone.x = x + capturedOffsetX;
  zone.y = y + capturedOffsetY;
  zone.width = width;
  zone.height = height;
  zone.onDragCallback = (screenX: number, screenY: number, phase: i32) => {
    onDragCallback(screenX - capturedOffsetX, screenY - capturedOffsetY, phase);
  };
  if (clipZoneToScrollBox(zone)) activeZones.push(zone);
}

/**
 * Recherche la zone interactive la plus haute sous le point `(pointX, pointY)`.
 * - Si `forTapsAndDrags` vaut `true`, ignore les zones de défilement pour trouver les boutons/curseurs.
 * - Si `forTapsAndDrags` vaut `false`, ne cherche que les conteneurs de défilement (`ScrollBox`).
 */
export function findTopmostZoneAt(pointX: number, pointY: number, forTapsAndDrags: boolean): TouchZone | null {
  for (let index = activeZones.length - 1; index >= 0; index--) {
    const zone = activeZones[index];
    if (zone.containsPoint(pointX, pointY)) {
      if (forTapsAndDrags && zone.scrollBox === null) return zone;
      if (!forTapsAndDrags && zone.scrollBox !== null) return zone;
    }
  }
  return null;
}

/** Indique si la zone `zoneId` est actuellement maintenue enfoncée par l'utilisateur. */
export function isZonePressed(zoneId: string): boolean {
  return uiState.pressedZoneId === zoneId;
}

/**
 * Ouvre une zone de défilement verticale et active le masque de découpe graphique (`clip`).
 * Doit toujours être fermé par un appel à `endScrollBox()`.
 */
export function beginScrollBox(
  scrollBox: ScrollBox,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const zone = new TouchZone();
  zone.id = 'scroll';
  zone.x = x + uiState.offsetX;
  zone.y = y + uiState.offsetY;
  zone.width = width;
  zone.height = height;
  zone.scrollBox = scrollBox;
  activeZones.push(zone);

  scrollBox.viewportHeight = height;
  clip(x, y, width, height);
  // ponytail: one level, a scroll box inside another would need a stack of rectangles
  isScrollClipOpen = true;
  scrollClipLeft = zone.x;
  scrollClipTop = zone.y;
  scrollClipRight = zone.x + width;
  scrollClipBottom = zone.y + height;
}

/** Ferme la zone de défilement ouverte par `beginScrollBox()`. */
export function endScrollBox(): void {
  unclip();
  isScrollClipOpen = false;
}
