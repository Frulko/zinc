package dev.zinc.app;

import android.app.Activity;
import android.content.Intent;

/**
 * What a plugin hears of the activity's life (plugin.json targets.android.lifecycle, docs/plugins.md "Phones"): ZincActivity calls every
 * plugin's subscriber, listed by zinc export in ZincPlugins, so no plugin edits the shell (Expo's native subscribers). All on the UI thread.
 */
public interface ZincLifecycle {
    default void onCreate(Activity activity, Intent intent) {}
    default void onNewIntent(Activity activity, Intent intent) {}
    default void onPause(Activity activity) {}
    default void onResume(Activity activity) {}
    default void onLowMemory(Activity activity) {}
    /** True when the result was this plugin's request (startActivityForResult with its own request code). */
    default boolean onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) { return false; }
    /** True when the request was this plugin's (requestPermissions with its own request code). */
    default boolean onRequestPermissionsResult(Activity activity, int requestCode, String[] permissions, int[] grantResults) { return false; }
}
