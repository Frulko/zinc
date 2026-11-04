// zinc:web/fetch on the web target: the browser's own Headers, Request, Response and fetch (docs/targets/web.md). See web.browser.ts.
const g: any = globalThis;
export const Headers = g.Headers, Request = g.Request, Response = g.Response, Body = undefined, RequestInit = undefined, ResponseInit = undefined;
export const fetch = g.fetch.bind(g);

/** What uploadFile returns; see fetch.ts. The file is one the person picked or dropped (zinc:system on the web): the browser reads it as it sends it. */
export function uploadFile(url: string, path: string, headers: [string, string][], onProgress: (sent: number, total: number) => void): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const file = g.__zincWeb.pickedFiles && g.__zincWeb.pickedFiles.get(path);
    if (!file) { reject(new TypeError(`no picked file ${path}`)); return; }
    const x = new g.XMLHttpRequest();
    x.open('POST', url);
    for (const h of headers) x.setRequestHeader(h[0], h[1]);
    x.upload.onprogress = (e: any) => onProgress(e.loaded, e.total);
    x.onerror = () => reject(new TypeError('fetch failed'));
    x.onload = () => resolve({ status: x.status, body: x.responseText });
    x.send(file);
  });
}
