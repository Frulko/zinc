// The web environment's globals, tree and events (ZN-568), as libraries use them: run with ZINC_WEB=1, the output is dom.out.
const log = (...a) => console.log(a.map(String).join(' '));

// the window is the global object
log('window', window === globalThis, self === window, top === window, typeof document, typeof navigator, window instanceof EventTarget, document.defaultView === window);
log('navigator', /Chrome\/\d+/.test(navigator.userAgent), /Mac|Linux|Win/.test(navigator.platform), navigator.maxTouchPoints, navigator.getGamepads().length, typeof navigator.language);
log('location', location.protocol, location.href.endsWith('/index.html'), document.baseURI === location.href, String(location) === location.href);
log('size', innerWidth, innerHeight, devicePixelRatio, screen.width, document.documentElement.clientWidth, document.body.getBoundingClientRect().height);
log('state', document.readyState, document.visibilityState, document.hidden, document.hasFocus(), document.activeElement === document.body);

// the tree
const div = document.createElement('div'), canvas = document.createElement('canvas'), span = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
div.id = 'game'; div.className = 'a b'; div.classList.add('c'); div.classList.remove('a'); div.classList.toggle('d');
document.body.appendChild(div); div.appendChild(canvas); div.append(span, 'text');
log('tree', div.tagName, canvas instanceof HTMLCanvasElement, canvas instanceof HTMLElement, canvas instanceof Node, canvas.parentNode === div, div.children.length, div.childNodes.length, div.className, span.nextSibling.nodeType, div.textContent);
log('find', document.getElementById('game') === div, document.querySelector('#game canvas') === canvas, document.querySelector('div.b > canvas') === canvas, document.querySelectorAll('canvas, span').length,
  document.getElementsByTagName('canvas').length, document.getElementsByClassName('d')[0] === div, canvas.closest('#game') === div, canvas.matches('canvas'), document.querySelector('main'), document.body.contains(canvas), canvas.isConnected, canvas.ownerDocument === document, canvas.getRootNode() === document);
try { document.querySelector('div:nth-child(2)'); } catch (e) { log('selector', e.name, e instanceof DOMException); }
canvas.setAttribute('data-kind', 'main'); canvas.tabIndex = 1;
log('attributes', canvas.getAttribute('data-kind'), canvas.hasAttribute('tabindex'), canvas.getAttribute('nope'), document.querySelector('[data-kind=main]') === canvas);
canvas.style.width = '50%'; canvas.style.setProperty('touch-action', 'none'); div.style.cssText = 'width: 400px; height: 300px';
log('style', canvas.style.touchAction, JSON.stringify(canvas.style.cursor), canvas.style.getPropertyValue('width'), div.style.cssText, getComputedStyle(div).width);
const r = canvas.getBoundingClientRect();
log('box', r.left, r.top, r.width, r.height, r.right, canvas.clientWidth, canvas.offsetHeight, div.offsetWidth, canvas.width, canvas.height, canvas.getContext('2d'));
div.removeChild(span); canvas.remove();
log('removed', div.childNodes.length, canvas.parentNode, canvas.isConnected);
try { div.removeChild(span); } catch (e) { log('removeChild', e.name); }
div.appendChild(canvas);

// events: capture, target, bubble, to the document and the window
const seen = [];
const note = where => e => seen.push(where + ':' + e.eventPhase + (e.currentTarget === e.target ? '=' : ''));
window.addEventListener('pointerdown', note('window'));
window.addEventListener('pointerdown', note('window-capture'), true);
document.addEventListener('pointerdown', note('document'));
div.addEventListener('pointerdown', note('div'), { once: true });
canvas.addEventListener('pointerdown', note('canvas'));
canvas.onpointerdown = note('canvas-on');
const ev = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 10, clientY: 20, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true });
log('dispatch', canvas.dispatchEvent(ev), seen.join(' '));
log('event', ev instanceof MouseEvent, ev instanceof Event, ev.type, ev.clientX, ev.pageY, ev.offsetX, ev.pointerType, ev.target === canvas, ev.currentTarget, ev.composedPath().length, typeof ev.timeStamp);
seen.length = 0; canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
log('once', seen.join(' '));
const stopper = e => { e.stopPropagation(); e.preventDefault(); };
canvas.addEventListener('wheel', stopper, { passive: true }); document.addEventListener('wheel', () => seen.push('never'));
const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 });
seen.length = 0;
log('stop', canvas.dispatchEvent(wheel), seen.length, wheel.defaultPrevented, wheel.deltaY, wheel.deltaMode === WheelEvent.DOM_DELTA_PIXEL);
canvas.removeEventListener('wheel', stopper); canvas.addEventListener('wheel', stopper);
log('prevent', canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true })));
const keys = [];
addEventListener('keydown', { handleEvent(e) { keys.push(e.key + '/' + e.code + '/' + e.keyCode + '/' + e.shiftKey + '/' + (e.target === document.body)); } });   // a bare call, a listener object
document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'A', code: 'KeyA', keyCode: 65, shiftKey: true }));
log('keys', keys.join(' '));
canvas.addEventListener('focus', () => seen.push('focus')); document.addEventListener('focusin', e => seen.push('focusin:' + (e.target === canvas)));
seen.length = 0; canvas.focus();
log('focus', document.activeElement === canvas, seen.join(' '));
const custom = new CustomEvent('p5Ready', { detail: { n: 1 } }); let detail = 0;
window.addEventListener('p5Ready', e => { detail = e.detail.n; }); window.dispatchEvent(custom);
const old = document.createEvent('Event'); old.initEvent('legacy', true, false); let legacy = false; document.addEventListener('legacy', () => { legacy = true; }); div.dispatchEvent(old);
log('custom', detail, legacy);
window.addEventListener('error', e => { log('error event', e.error.message, e.message); e.preventDefault(); });
canvas.addEventListener('boom', () => { throw new Error('in a listener'); }); canvas.addEventListener('boom', () => seen.push('next listener still runs'));
seen.length = 0; canvas.dispatchEvent(new Event('boom'));
log('after a throw', seen.join(''));

// the rest of the window
log('clone', (() => { const a = { n: 1, list: [1, 2], when: new Date(5), map: new Map([['k', new Float32Array([1.5])]]) }; a.self = a; const b = structuredClone(a); return [b !== a, b.self === b, b.list[1], b.when.getTime(), b.map.get('k')[0], b.map.get('k') instanceof Float32Array].join(' '); })());
try { structuredClone(() => 1); } catch (e) { log('clone of a function', e.constructor.name); }
log('media', matchMedia('(pointer: coarse)').matches, typeof matchMedia('x').addEventListener, document.createElement('video').canPlayType('video/mp4') === '', document.createElement('audio') instanceof HTMLAudioElement);
log('classes', [typeof PromiseRejectionEvent, typeof ResizeObserver, typeof MutationObserver, typeof MessageChannel, typeof TouchEvent, typeof DOMRect, typeof requestAnimationFrame, typeof fetch].join(' '));

// what happens after the module: messages, observers, the unhandled rejection, then the load events (in this order of time)
const order = [];
const channel = new MessageChannel();
channel.port2.onmessage = e => order.push('port ' + e.data);
channel.port1.postMessage('ping');
window.addEventListener('message', e => order.push('message ' + e.data + ' ' + (e.source === window)));
postMessage('hello', '*');
new ResizeObserver(entries => order.push('resize ' + entries[0].contentRect.width + 'x' + entries[0].contentRect.height + ' ' + (entries[0].target === div))).observe(div);
window.addEventListener('unhandledrejection', e => { order.push('unhandledrejection ' + e.reason.message + ' ' + (e.promise instanceof Promise)); if (e.reason.message === 'quiet') e.preventDefault(); });
Promise.reject(new Error('quiet'));
Promise.reject(new Error('loud'));
document.addEventListener('DOMContentLoaded', () => order.push('DOMContentLoaded ' + document.readyState));
window.onload = () => order.push('load ' + document.readyState);
setTimeout(() => { for (const line of order) log(line); }, 1);
