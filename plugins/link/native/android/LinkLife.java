package dev.zinc.plugins.link;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.wifi.WifiManager;

import dev.zinc.app.ZincLifecycle;

/**
 * zinc:link on Android: the Wi-Fi driver drops multicast packets unless an app holds a MulticastLock, so without it the mDNS questions of
 * the other side never reach the program's responder (the native code, the same as on the desktop: src/net/dnssd.cpp). Held while the
 * activity is in front, released when it leaves: multicast keeps the radio awake (docs/plugins/link.md, "Android").
 */
public class LinkLife implements ZincLifecycle {
    private WifiManager.MulticastLock lock;
    private boolean off;

    @Override public void onCreate(Activity activity, Intent intent) {
        String env = intent != null ? intent.getStringExtra("zinc.env") : null;   // the measure of docs/plugins/link.md: discovery without the lock
        off = env != null && env.contains("ZINC_LINK_NO_LOCK=1");
    }

    @Override public void onResume(Activity activity) {
        if (off) return;
        if (lock == null) {
            WifiManager wifi = (WifiManager) activity.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi == null) return;
            lock = wifi.createMulticastLock("zinc:link");
            lock.setReferenceCounted(false);
        }
        lock.acquire();
    }

    @Override public void onPause(Activity activity) {
        if (lock != null && lock.isHeld()) lock.release();
    }
}
