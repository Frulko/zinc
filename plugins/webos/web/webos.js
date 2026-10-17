// zinc:webos in the browser: a page is never on webOS, so isWebOS() is false and every call answers false (the program runs on a desktop and on the tablet unchanged).
globalThis.__zincWeb.registerNative('Webos', {
  available: () => false,
  call: () => false,
  error: () => 'not on webOS',
  screenTimeout: () => false,
});
