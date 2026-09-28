// zinc:webview on the sim target: headless, no page runs. Views are plain handles so programs start; nothing shows.
let n = 0;
export default {
  create(_x: number, _y: number, _w: number, _h: number): number { return n++; },
  setBounds(_v: number, _x: number, _y: number, _w: number, _h: number): void {},
  setVisible(_v: number, _on: boolean): void {},
  navigate(_v: number, _url: string): void {},
  loadHtml(_v: number, _html: string, _base: string): void {},
  eval(_v: number, _js: string): void {},
  post(_v: number, _data: string): void {},
  reply(_v: number, _id: number, _ok: boolean, _r: string): void {},
  close(_v: number): void {},
  onEvent(_cb: (v: number, kind: number, id: number, a: string, b: string) => void): void {},
};
