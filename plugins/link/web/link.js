// zinc:link in a browser: a page can neither answer nor ask DNS-SD, nor open a socket. Each call says so, so one program builds for both.
const Z = globalThis.__zincWeb;
const NO = 'zinc:link needs a native program: a page has no sockets';
Z.registerNative('Link', {
  init: () => '', listen: () => -1, advertise: () => false, setInfo: () => {}, browse: () => false, openPairing: () => '', closePairing: () => {},
  pair: () => -1, connect: () => -1, send: () => false, sendBytes: () => false, close: () => {}, peers: () => '[]', forget: () => false,
  addresses: () => '', error: () => NO, next: () => '', bytes: () => [],
}, []);
