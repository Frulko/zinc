// The window's focus and visibility as a game library hears them (Phaser's VisibilityHandler, a pause on blur): window focus and blur, the
// document's visibilitychange, document.hidden, visibilityState and hasFocus(); no animation frame runs while the page is hidden.
// Driven by focus.input: the window loses and gets the focus, then is minimised and shown again.
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
let frames = 0;
const log = what => console.log(`frame ${frames}: ${what} hidden=${document.hidden} state=${document.visibilityState} focus=${document.hasFocus()}`);
window.addEventListener('blur', e => log(`window blur (${e.constructor.name}, target is window: ${e.target === window})`));
window.addEventListener('focus', () => log('window focus'));
document.addEventListener('visibilitychange', e => log(`visibilitychange (bubbles: ${e.bubbles})`));
window.onblur = () => log('onblur handler');
log('start');
requestAnimationFrame(function tick() { frames++; requestAnimationFrame(tick); });
