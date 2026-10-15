// zinc:webos without native code: not webOS.
export default {
  available(): boolean { return false; },
  call(uri: string, params: string): boolean { return false; },
  error(): string { return 'not webOS'; },
  screenTimeout(enable: boolean): boolean { return false; },
};
