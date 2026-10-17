// zinc:web/fetch on the web target: the browser's own Headers, Request, Response and fetch (docs/targets/web.md). See web.browser.ts.
const g: any = globalThis;
export const Headers = g.Headers, Request = g.Request, Response = g.Response, Body = undefined, RequestInit = undefined, ResponseInit = undefined;
export const fetch = g.fetch.bind(g);
