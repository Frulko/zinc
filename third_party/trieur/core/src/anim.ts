// How cards enter and leave.
//
// One exit, two entrances. The card being filed is always sucked into its tile: flinging it
// off-screen along the gesture does not say where it landed. Entrances, on the other hand,
// say where the card comes from — dealt down one notch after a filing, dropped from above
// after an undo.

/** Where the appearing card comes from. */
export type Enter = 'sort' | 'undo';

/**
 * Sets a starting state on a freshly inserted element, then releases it: it transitions to
 * its resting position.
 *
 * The forced reflow is essential — without it the browser only ever sees one state and
 * animates nothing.
 */
export function animateFrom(el: HTMLElement, transform: string, opacity: number): void {
  el.style.transition = 'none';
  el.style.transform = transform;
  el.style.opacity = String(opacity);
  void el.offsetWidth;
  el.style.transition = '';
  el.style.transform = '';
  el.style.opacity = '';
}

/** The top card appears: dealt down one notch, or dropped back from above after an undo. */
export function enterTop(el: HTMLElement, kind: Enter): void {
  if (kind === 'sort') animateFrom(el, 'scale(0.94) translateY(14px)', 0.55);
  else animateFrom(el, 'translateY(-160px) scale(1.03) rotate(-2deg)', 0);
}

/** The card behind moves up one notch. */
export function enterBehind(el: HTMLElement): void {
  animateFrom(el, 'scale(0.86) translateY(28px)', 0);
}

/** Genie effect: the card is sucked into its tile. `tilt` preserves the feel of the gesture. */
export function genie(el: HTMLElement, to: { x: number; y: number }, tilt: number): void {
  el.classList.add('tr-genie');
  el.style.transform = `translate(${to.x}px, ${to.y}px) scale(0.06) rotate(${tilt}deg)`;
  el.addEventListener('transitionend', () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 500); // safety net if the transition never fires
}

/** The tile acknowledges receipt, on the way out as on the way back. */
export function catchPulse(tile: Element | null | undefined): void {
  if (!tile) return;
  tile.classList.remove('tr-catch');
  void (tile as HTMLElement).offsetWidth; // restarts the animation even on two cards in a row
  tile.classList.add('tr-catch');
}
