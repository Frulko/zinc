// zinc:webos without native code: not webOS.
export default {
  available(): boolean { return false; },
  call(uri: string, params: string): boolean { return false; },
};
