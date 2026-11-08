// zinc:link in a browser: a page can neither answer nor ask DNS-SD, nor open a socket. init, which every call of the module runs first, throws
// ZnUnsupported, so a program tells "not here" from a real failure (`e instanceof ZnUnsupported`, zinc:browser) and one program builds for both.
const Z = globalThis.__zincWeb;
const NO = 'zinc:link needs a native program: a page has no sockets';
Z.registerNative('Link', {
  init: () => { throw new Z.ZnUnsupported('zinc:link', 'a page has no sockets: pairing and channels need the native program'); },
  listen: () => -1, advertise: () => false, setInfo: () => {}, browse: () => false, openPairing: () => '', closePairing: () => {},
  pair: () => -1, connect: () => -1, send: () => false, sendBytes: () => false, close: () => {}, peers: () => '[]', forget: () => false,
  addresses: () => '', error: () => NO, next: () => '', bytes: () => [],
}, []);
