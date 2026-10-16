package dev.zinc.system;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;

import dev.zinc.app.ZincActivity;
import dev.zinc.app.ZincLifecycle;

/**
 * zinc:system on Android (ZN-628, plugins/system/native/system.android.cpp calls it): what a phone has of the op table (ops.json): local
 * notifications, the share sheet, opening a URL, the document picker, deep links. call() runs on the program's thread and answers at once (null:
 * an op this backend does not do, the simulator's answer stands); the work that needs the UI thread is posted to it. Events (a notification's
 * tap, a deep link, a picker's answer) wait in a queue the program drains with poll(). As the app's lifecycle subscriber (plugin.json
 * targets.android.lifecycle) it hears the intents and the picker's result.
 */
public final class SystemBackend implements ZincLifecycle {
    static final int PICK = 0x5a01, ASK = 0x5a02;
    static final String CHANNEL = "zinc", EXTRA = "zinc.notification";
    static final ConcurrentLinkedQueue<String> events = new ConcurrentLinkedQueue<>();
    static volatile String launchUrl = null, pickToken = null;

    static void event(String type, String... args) {
        JSONArray a = new JSONArray();
        for (String s : args) a.put(s);
        try { events.add(new JSONObject().put("type", type).put("args", a).toString()); } catch (Exception e) { /* a JSON put of strings does not fail */ }
    }
    static String error(String code, String message) {
        try { return new JSONObject().put("error", new JSONObject().put("code", code).put("message", message)).toString(); } catch (Exception e) { return "{}"; }
    }

    public static String poll() { return events.poll(); }
    public static boolean pending() { return pickToken != null; }

    public static String call(String op, String json) {
        final ZincActivity act = ZincActivity.current();
        if (act == null) return null;
        try {
            JSONObject a = new JSONObject(json);
            switch (op) {
                case "notification.requestPermission": return requestPermission(act);
                case "notification.notify": return notify(act, a);
                case "notification.cancel": nm(act).cancel(a.optString("id"), 0); return "{}";
                case "notification.backend": return "{\"backend\":\"native\"}";
                case "opener.open": return open(act, a.optString("target"));
                case "share.share": return share(act, a);
                case "deep-link.getCurrent": return new JSONObject().put("urls", launchUrl == null ? new JSONArray() : new JSONArray().put(launchUrl)).toString();
                case "dialog.open": return pick(act, a);
                default: return null;
            }
        } catch (Exception e) {
            return error("failed", op + ": " + e);
        }
    }

    // ---- notifications: a channel of the app's (Android 8), the POST_NOTIFICATIONS prompt (Android 13), a tap reopens the app with the id
    static NotificationManager nm(Context c) { return (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE); }
    static boolean allowed(Activity act) {
        return Build.VERSION.SDK_INT < 33 ? nm(act).areNotificationsEnabled() : act.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }
    static String requestPermission(final Activity act) throws Exception {
        if (allowed(act)) return "{\"state\":\"granted\"}";
        if (Build.VERSION.SDK_INT < 33) return "{\"state\":\"denied\"}";   // turned off in the settings: no prompt before Android 13
        act.runOnUiThread(() -> act.requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, ASK));
        return "{\"state\":\"default\"}";   // the user's answer comes later; ask again for it
    }
    static String notify(Activity act, JSONObject a) throws Exception {
        final String id = a.optString("id", UUID.randomUUID().toString());
        if (!allowed(act)) return new JSONObject().put("id", id).put("delivered", false).put("reason", "permission").toString();
        NotificationManager m = nm(act);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            if (m.getNotificationChannel(CHANNEL) == null) m.createNotificationChannel(new NotificationChannel(CHANNEL, "Notifications", NotificationManager.IMPORTANCE_DEFAULT));
            b = new Notification.Builder(act, CHANNEL);
        } else {
            b = new Notification.Builder(act);
        }
        Intent tap = new Intent(act, act.getClass()).putExtra(EXTRA, id).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(act, id.hashCode(), tap, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        b.setSmallIcon(act.getApplicationInfo().icon).setContentTitle(a.optString("title")).setAutoCancel(true).setContentIntent(pi);
        if (!a.optString("body").isEmpty()) b.setContentText(a.optString("body"));
        if (!a.optString("subtitle").isEmpty()) b.setSubText(a.optString("subtitle"));
        if (!a.optString("group").isEmpty()) b.setGroup(a.optString("group"));
        m.notify(id, 0, b.build());
        return new JSONObject().put("id", id).put("delivered", true).toString();
    }

    // ---- opener and share: the system's chooser
    static String open(final Activity act, String target) {
        final Uri u = target.startsWith("/") ? null : Uri.parse(target);
        if (u == null || u.getScheme() == null) return error("unsupported", "a file is opened through share.share on Android: " + target);
        final Intent i = new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (i.resolveActivity(act.getPackageManager()) == null && !u.getScheme().startsWith("http")) return error("failed", "no app opens " + target);
        act.runOnUiThread(() -> { try { act.startActivity(i); } catch (ActivityNotFoundException e) { /* nothing to open it with */ } });
        return "{}";
    }
    static String share(final Activity act, JSONObject a) {
        String text = a.optString("text"), url = a.optString("url"), title = a.optString("title");
        String body = text.isEmpty() ? url : url.isEmpty() ? text : text + " " + url;
        if (body.isEmpty()) return error("failed", "share needs a text or a url");
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, body);
        if (!title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
        final Intent chooser = Intent.createChooser(send, title.isEmpty() ? null : title);
        act.runOnUiThread(() -> act.startActivity(chooser));
        return "{\"shared\":true}";
    }

    // ---- the document picker (Storage Access Framework, no permission): the chosen documents are copied into the app's cache, answered as
    // the event dialog-result [token, paths as JSON]
    static String pick(final Activity act, JSONObject a) throws Exception {
        if (pickToken != null) return error("failed", "a picker is already open");
        final Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        ArrayList<String> types = new ArrayList<>();
        JSONArray filters = a.optJSONArray("filters");
        for (int f = 0; filters != null && f < filters.length(); f++) {
            JSONArray ext = filters.getJSONObject(f).optJSONArray("extensions");
            for (int e = 0; ext != null && e < ext.length(); e++) {
                String t = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.getString(e).toLowerCase());
                if (t != null && !types.contains(t)) types.add(t);
            }
        }
        if (!types.isEmpty()) i.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
        if (a.optBoolean("multiple")) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        pickToken = UUID.randomUUID().toString();
        final String token = pickToken;
        act.runOnUiThread(() -> act.startActivityForResult(i, PICK));
        return new JSONObject().put("paths", JSONObject.NULL).put("pending", token).toString();
    }
    static String keep(Activity act, Uri u) {
        String name = "picked";
        try (Cursor c = act.getContentResolver().query(u, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) name = c.getString(0);
        } catch (Exception e) { /* no display name: a generic one */ }
        File dir = new File(act.getCacheDir(), "zinc-picked");
        dir.mkdirs();
        File to = new File(dir, UUID.randomUUID().toString().substring(0, 8) + "-" + name.replace('/', '_'));
        try (InputStream in = act.getContentResolver().openInputStream(u); OutputStream out = new FileOutputStream(to)) {
            byte[] buf = new byte[65536];
            for (int n; in != null && (n = in.read(buf)) > 0;) out.write(buf, 0, n);
            return to.getAbsolutePath();
        } catch (Exception e) {
            return null;
        }
    }

    // ---- the activity's life (ZincActivity): deep links, notification taps, the picker's result
    void intent(Intent i, boolean launch) {
        if (i == null) return;
        String note = i.getStringExtra(EXTRA);
        if (note != null) { i.removeExtra(EXTRA); event("notification-click", note); return; }
        if (Intent.ACTION_VIEW.equals(i.getAction()) && i.getData() != null) {
            String url = i.getData().toString();
            if (launch) launchUrl = url;   // the link the app was started with: deep-link.getCurrent, as Tauri's getCurrent
            else event("open-url", url);
        }
    }
    @Override public void onCreate(Activity act, Intent i) { intent(i, true); }
    @Override public void onNewIntent(Activity act, Intent i) { intent(i, false); }
    @Override public boolean onActivityResult(final Activity act, int request, int result, final Intent data) {
        if (request != PICK) return false;
        final String token = pickToken;
        new Thread(() -> {   // copying a large document takes a while: not on the UI thread
            JSONArray paths = new JSONArray();
            if (result == Activity.RESULT_OK && data != null) {
                if (data.getClipData() != null) for (int k = 0; k < data.getClipData().getItemCount(); k++) { String p = keep(act, data.getClipData().getItemAt(k).getUri()); if (p != null) paths.put(p); }
                else if (data.getData() != null) { String p = keep(act, data.getData()); if (p != null) paths.put(p); }
            }
            event("dialog-result", token, paths.length() == 0 ? "null" : paths.toString());
            pickToken = null;
        }).start();
        return true;
    }
    @Override public boolean onRequestPermissionsResult(Activity act, int request, String[] permissions, int[] results) { return request == ASK; }
}
