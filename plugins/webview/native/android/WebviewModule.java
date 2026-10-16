package dev.zinc.plugins.webview;

import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.util.Log;
import android.util.SparseArray;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;

import dev.zinc.app.ZincActivity;
import dev.zinc.app.ZincCallback;
import dev.zinc.app.ZincNativeView;

/**
 * zinc:webview on Android (docs/plugins/webview.md): an android.webkit.WebView over the Zinc surface, placed by a zinc:ui NativeView through
 * ZincNativeView. zinc://app/<path> is served from the app's assets (copied by the shell into the app's files) under
 * https://appassets.androidplatform.net/, the host Android keeps for an app's own content, so the page is a secure origin and fetch() works.
 * The page side (window.zinc) is the macOS one over a JavaScript interface; the interface is reachable from every frame, so each call carries a
 * token that only the main document of a trusted page (the app's assets, a local dev server the app opened) was given.
 * The spec's methods run on the program's thread; the views live on the UI thread.
 */
public class WebviewModule implements WebviewSpec {
    static final String HOST = "appassets.androidplatform.net", ORIGIN = "https://" + HOST + "/";
    static final String TAG = "zinc";

    static final class Entry {
        WebView wv;
        ZincNativeView nv;
        String token;
        volatile int port = -1;          // the local http(s) server the app navigated to (-1: none)
    }

    private final SparseArray<Entry> views = new SparseArray<>();   // UI thread
    private volatile ZincCallback cb;
    private int next = 0;                                           // program thread
    private final SecureRandom random = new SecureRandom();

    private static void ui(Runnable r) {
        Activity a = ZincActivity.current();
        if (a != null) a.runOnUiThread(r);
    }

    private void event(int v, int kind, int id, String a, String b) {
        ZincCallback c = cb;
        if (c != null) c.call(v, kind, id, a == null ? "" : a, b == null ? "" : b);
    }

    @Override public void onEvent(ZincCallback c) { cb = c; }

    @Override
    public int create(double x, double y, double w, double h) {
        if (ZincActivity.current() == null) return -1;
        final int v = next++;
        final Entry e = new Entry();
        byte[] t = new byte[16];
        random.nextBytes(t);
        StringBuilder sb = new StringBuilder();
        for (byte b : t) sb.append(String.format("%02x", b));
        e.token = sb.toString();
        ui(() -> {
            Activity a = ZincActivity.current();
            WebView wv = new WebView(a);
            WebSettings s = wv.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setAllowFileAccess(false);
            WebView.setWebContentsDebuggingEnabled((a.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);   // chrome://inspect
            wv.setBackgroundColor(0);
            wv.addJavascriptInterface(new Bridge(v, e), "__zincNative");
            wv.setWebViewClient(new Client(v, e));
            e.wv = wv;
            e.nv = new ZincNativeView(wv);
            views.put(v, e);
            e.nv.attach();
        });
        place(v, x, y, w, h, x, y, w, h);
        return v;
    }

    @Override public void setBounds(int v, double x, double y, double w, double h) { place(v, x, y, w, h, x, y, w, h); }

    @Override
    public void place(int v, double x, double y, double w, double h, double cx, double cy, double cw, double ch) {
        ui(() -> { Entry e = views.get(v); if (e != null) e.nv.place(x, y, w, h, cx, cy, cw, ch); });
    }

    @Override public void setVisible(int v, boolean on) { ui(() -> { Entry e = views.get(v); if (e != null) e.nv.setShown(on); }); }

    /** zinc://app/x -> https://appassets.androidplatform.net/x; a page's URL back to zinc://app/ for the program. */
    static String toPage(String url) { return url.startsWith("zinc://app/") ? ORIGIN + url.substring(11) : url; }
    static String toProgram(String url) { return url != null && url.startsWith(ORIGIN) ? "zinc://app/" + url.substring(ORIGIN.length()) : url; }

    /** The app's own pages and the local dev server it opened (same port) get the bridge: the macOS rule. */
    static boolean trusted(String url, int appPort) {
        if (url == null) return false;
        if (url.startsWith(ORIGIN)) return true;
        Uri u = Uri.parse(url);
        String h = u.getHost();
        int port = u.getPort() < 0 ? 0 : u.getPort();
        return ("http".equals(u.getScheme()) || "https".equals(u.getScheme())) && ("localhost".equals(h) || "127.0.0.1".equals(h)) && port == appPort;
    }

    private static void notePort(Entry e, String url) {
        Uri u = Uri.parse(url);
        String sc = u.getScheme();
        if ("http".equals(sc) || "https".equals(sc)) e.port = u.getPort() < 0 ? 0 : u.getPort();
    }

    @Override
    public void navigate(int v, String url) {
        final String page = toPage(url);
        ui(() -> {
            Entry e = views.get(v);
            if (e == null) return;
            if (!page.startsWith(ORIGIN)) notePort(e, page);
            e.wv.loadUrl(page);
        });
    }

    @Override
    public void loadHtml(int v, String html, String baseUrl) {
        final String base = toPage(baseUrl);
        ui(() -> {
            Entry e = views.get(v);
            if (e == null) return;
            if (!base.startsWith(ORIGIN)) notePort(e, base);
            e.wv.loadDataWithBaseURL(base, trusted(base, e.port) ? withBridge(html, e.token) : html, "text/html", "utf-8", null);
        });
    }

    @Override public void eval(int v, String js) { ui(() -> { Entry e = views.get(v); if (e != null) e.wv.evaluateJavascript(js, null); }); }

    @Override
    public void post(int v, String data) {
        final String js = "window.zinc && window.zinc.__dispatch(" + quote(data) + ")";
        ui(() -> { Entry e = views.get(v); if (e != null) e.wv.evaluateJavascript(js, null); });
    }

    @Override
    public void reply(int v, int id, boolean ok, String result) {
        final String js = "window.zinc && window.zinc.__settle(" + id + ", " + ok + ", " + quote(result) + ")";
        ui(() -> { Entry e = views.get(v); if (e != null) e.wv.evaluateJavascript(js, null); });
    }

    @Override
    public void close(int v) {
        ui(() -> {
            Entry e = views.get(v);
            if (e == null) return;
            views.remove(v);
            e.nv.detach();
            ui(() -> e.wv.destroy());   // after the container left the layout
        });
    }

    // ---------------------------------------------------------------- the page side
    /** window.zinc, as on macOS (plugins/webview/src/webview.mm BRIDGE), over the JavaScript interface. */
    static String bridge(String token) {
        return "(() => { if (window.zinc) return; const h = window.__zincNative, tok = '" + token + "', pend = new Map(); let seq = 0;"
            + "const str = (x) => x === undefined ? '' : typeof x === 'string' ? x : JSON.stringify(x);"
            + "const parse = (s) => { try { return JSON.parse(s); } catch (e) { return s; } };"
            + "window.zinc = {"
            + " postMessage(x) { h.post(tok, 'm', 0, '', str(x)); },"
            + " invoke(cmd, args) { return new Promise((res, rej) => { const id = ++seq; pend.set(id, [res, rej]); h.post(tok, 'i', id, String(cmd), str(args)); }); },"
            + " onmessage: null,"
            + " __settle(id, ok, r) { const p = pend.get(id); if (!p) return; pend.delete(id); if (ok) p[0](parse(r)); else p[1](new Error(r)); },"
            + " __dispatch(d) { const v = parse(d); if (window.zinc.onmessage) window.zinc.onmessage(v); window.dispatchEvent(new MessageEvent('zinc', { data: v })); },"
            + "};})();";
    }

    /** The bridge as the document's first script: after a doctype (before it would put the page in quirks mode). */
    static String withBridge(String html, String token) {
        String tag = "<script>" + bridge(token) + "</script>";
        int at = 0;
        String head = html.length() > 64 ? html.substring(0, 64) : html;
        if (head.trim().toLowerCase().startsWith("<!doctype")) at = html.indexOf('>') + 1;
        return html.substring(0, at) + tag + html.substring(at);
    }

    static String quote(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20 || c == 0x2028 || c == 0x2029) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    final class Bridge {
        final int v;
        final Entry e;
        Bridge(int v, Entry e) { this.v = v; this.e = e; }
        /** From the page's thread: queued for the program (ZincCallback). */
        @JavascriptInterface
        public void post(String token, String t, int id, String cmd, String d) {
            if (!e.token.equals(token)) { Log.w(TAG, "zinc:webview: IPC ignored (a page or a frame the app did not open)"); return; }
            if ("i".equals(t)) event(v, 1, id, cmd, d);
            else event(v, 0, 0, d, "");
        }
    }

    final class Client extends WebViewClient {
        final int v;
        final Entry e;
        Client(int v, Entry e) { this.v = v; this.e = e; }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
            // the app's own pages carry the bridge in their HTML; a local dev server's page gets it now (ponytail: before its scripts on most
            // loads, not all; androidx.webkit's addDocumentStartJavaScript when such a page needs it from its first script)
            if (url != null && !url.startsWith(ORIGIN) && trusted(url, e.port)) view.evaluateJavascript(bridge(e.token), null);
        }

        @Override public void onPageFinished(WebView view, String url) { event(v, 2, 0, toProgram(url), ""); }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!HOST.equals(u.getHost())) return null;
            String name = u.getPath() == null || u.getPath().length() <= 1 ? "index.html" : u.getPath().substring(1);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            Activity a = ZincActivity.current();
            File f = a == null || name.contains("..") ? null : new File(a.getFilesDir(), "assets/" + name);
            try {
                if (f == null || !f.isFile()) throw new IOException("not found");
                String mime = mime(name);
                InputStream in;
                if (mime.equals("text/html")) {
                    String html = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
                    in = new ByteArrayInputStream(withBridge(html, e.token).getBytes(StandardCharsets.UTF_8));
                } else in = new FileInputStream(f);
                return new WebResourceResponse(mime, "utf-8", 200, "OK", headers, in);
            } catch (IOException x) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers, new ByteArrayInputStream("not found".getBytes(StandardCharsets.UTF_8)));
            }
        }
    }

    static String mime(String name) {
        int dot = name.lastIndexOf('.');
        String ext = dot < 0 ? "" : name.substring(dot + 1).toLowerCase();
        switch (ext) {
            case "html": case "htm": return "text/html";
            case "css": return "text/css";
            case "js": case "mjs": return "text/javascript";
            case "json": return "application/json";
            case "svg": return "image/svg+xml";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "gif": return "image/gif";
            case "webp": return "image/webp";
            case "wasm": return "application/wasm";
            case "txt": return "text/plain";
            case "woff2": return "font/woff2";
            case "ttf": return "font/ttf";
            default: return "application/octet-stream";
        }
    }
}
