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

/** Liste des zones interactives collectées lors du dernier rendu de l'arbre. */
export let activeZones: TouchZone[] = [];

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
  activeZones.push(zone);
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
  activeZones.push(zone);
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
}

/** Ferme la zone de défilement ouverte par `beginScrollBox()`. */
export function endScrollBox(): void {
  unclip();
}
