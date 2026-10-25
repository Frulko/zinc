package dev.zinc.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.net.wifi.WifiManager;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.util.Log;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;

import org.libsdl.app.SDLActivity;
import org.libsdl.app.ZincEdit;

/**
 * The activity of a Zinc app (zinc export --target android): SDL's, plus what a phone's OS tells the program and what the program asks of it
 * (docs/ui.md "System signals", docs/targets/android.md). To the engine: nativeSignal("kind args") lines (src/host/hal_dispatch.cpp), the font
 * scale, reduce motion, the keyboard's height, the predictive back gesture, the screen reader's actions; from it: zincCommand(query, arg) (zinc:sys
 * device(), through src/app/android_glue.cpp): haptics, the status bar, the system's back, the text input connection's state and the keyboard's
 * traits, zinc:ui's accessibility tree (ZincAccessibility).
 * Run on the API 37 emulator (ZN-625, ZN-626: docs/reports/zinc-next-android.md); a real phone is the cross-platform pass (backlog/later.md).
 */
public class ZincActivity extends SDLActivity {
    /** The SDL_SendAndroidMessage command of the window's brightness (include/zn/app.h ZN_APP_ANDROID_BRIGHTNESS). */
    static final int BRIGHTNESS = 0x8001;
    /** ... and steady clocks while frames move (ZN_APP_ANDROID_SUSTAINED: 1 frames move, 0 at rest, targets/macos/hal_sdl.cpp). */
    static final int SUSTAINED = 0x8002;
    static ZincActivity self;
    static native void nativeInit();
    public static native void nativeSignal(String line);

    private int keyboardShown = -1;
    private Object backCallback;
    /** The plugins' lifecycle subscribers (plugin.json targets.android.lifecycle), listed by zinc export in ZincPlugins. */
    private final ZincLifecycle[] plugins = ZincPlugins.lifecycles();

    /** The activity, for a plugin's code (null before onCreate). */
    public static ZincActivity current() { return self; }

    private WifiManager.MulticastLock multicast;
    /** Zinc Go's device mode (src/app/player.cpp, ZN-792): Wi-Fi drops multicast without this lock, and mDNS is multicast. Needs
     *  CHANGE_WIFI_MULTICAST_STATE (zinc export adds it to a player's manifest); without it the player is reached by its address only. */
    public void zincMulticast(boolean on) {
        try {
            if (on && multicast == null) {
                WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wifi == null) return;
                multicast = wifi.createMulticastLock("zinc-player");
                multicast.setReferenceCounted(false);
                multicast.acquire();
            } else if (!on && multicast != null) {
                multicast.release();
                multicast = null;
            }
        } catch (RuntimeException e) {
            Log.w("zinc", "no multicast lock: " + e);
        }
    }
    private boolean moving, programFast, sustainedOn;   // who wants steady clocks, and what the window has
    private static int sustainedSupported = -1;        // PowerManager.isSustainedPerformanceModeSupported, asked once

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        self = this;
        // the program draws under the status and navigation bars (Android 15 makes every app edge-to-edge) and pads by the safe area; SDL's
        // legacy theme would paint them black over it (ZN-625)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        // the keyboard neither pans the window nor resizes it: an edge-to-edge window gets the IME's insets (watchKeyboard) and zinc:ui scrolls
        // the focused field above the keyboard itself (pan moved the whole window as well: the field went up twice)
        if (Build.VERSION.SDK_INT >= 35) getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        nativeInit();
        sendConfiguration(getResources().getConfiguration());
        ZincEdit.install(this);
        ZincAccessibility.install(this, mSurface);
        watchKeyboard();
        registerBack();
        for (ZincLifecycle p : plugins) p.onCreate(this, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {   // a deep link or a notification's tap while the app runs
        super.onNewIntent(intent);
        setIntent(intent);
        for (ZincLifecycle p : plugins) p.onNewIntent(this, intent);
    }

    @Override
    protected void onPause() {
        setSustained(false);   // the system ends it with the focus too; the wishes stay for the resume
        super.onPause();
        for (ZincLifecycle p : plugins) p.onPause(this);
    }

    @Override
    public void onLowMemory() {
        super.onLowMemory();
        for (ZincLifecycle p : plugins) p.onLowMemory(this);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        for (ZincLifecycle p : plugins) if (p.onActivityResult(this, requestCode, resultCode, data)) return;
        super.onActivityResult(requestCode, resultCode, data);   // SDL's file dialog
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        for (ZincLifecycle p : plugins) if (p.onRequestPermissionsResult(this, requestCode, permissions, grantResults)) return;
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);   // SDL's SDL_RequestPermission
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        sendConfiguration(c);
    }

    @Override
    protected void onResume() {
        super.onResume();
        sendReduceMotion();   // the setting may have changed while the app was away
        for (ZincLifecycle p : plugins) p.onResume(this);
        sustain();
    }

    /** Steady clocks (Window.setSustainedPerformanceMode, API 24) where the device has them: the clocks a device can hold without heating, rather
     *  than bursts the thermal limits cut. Wanted while frames move or while the program asks for full speed (zinc:webos setPerformance). */
    static boolean sustainedSupported(Activity a) {
        if (sustainedSupported < 0) {
            PowerManager pm = Build.VERSION.SDK_INT >= 24 ? (PowerManager) a.getSystemService(Context.POWER_SERVICE) : null;
            sustainedSupported = pm != null && pm.isSustainedPerformanceModeSupported() ? 1 : 0;
            Log.i("zinc", "sustained performance mode supported: " + (sustainedSupported == 1));
        }
        return sustainedSupported == 1;
    }

    void sustain() { setSustained(moving || programFast); }

    void setSustained(boolean on) {
        if (on == sustainedOn) return;
        sustainedOn = on;
        final boolean can = sustainedSupported(this);
        if (can) getWindow().setSustainedPerformanceMode(on);
        Log.d("zinc", "sustained performance mode " + (on ? "on" : "off") + (can ? "" : " (not supported here: nothing asked)"));
    }

    /** The surface's units: the window's pixels over the zoom of targets/macos/hal_sdl.cpp (the display scale, whole, 1 below 1.5). */
    float zoom() {
        float d = getResources().getDisplayMetrics().density;
        return d >= 1.5f ? Math.round(d) : 1f;
    }

    void sendConfiguration(Configuration c) {
        if (!barStyled) barIcons(c);
        nativeSignal("fontscale " + c.fontScale);
        sendReduceMotion();
    }

    void sendReduceMotion() {
        float k = Settings.Global.getFloat(getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f);
        nativeSignal("reducemotion " + (k == 0f ? "1" : "0"));
    }

    /** The on-screen keyboard's height (SDL says shown or hidden, from API 30, without a height): the IME's inset from API 30, else the part of the
     *  window the visible frame lost. */
    void watchKeyboard() {
        final View root = getWindow().getDecorView();
        root.getViewTreeObserver().addOnGlobalLayoutListener(new ViewTreeObserver.OnGlobalLayoutListener() {
            @Override public void onGlobalLayout() {
                int px;
                if (Build.VERSION.SDK_INT >= 30 && root.getRootWindowInsets() != null) {
                    px = root.getRootWindowInsets().getInsets(WindowInsets.Type.ime()).bottom;
                } else {
                    Rect r = new Rect();
                    root.getWindowVisibleDisplayFrame(r);
                    px = Math.max(0, root.getHeight() - r.bottom);
                    if (px < root.getHeight() / 8) px = 0;   // the navigation bar, not a keyboard
                }
                int h = Math.round(px / zoom());
                if (h != keyboardShown) { keyboardShown = h; nativeSignal("keyboard " + h); }
            }
        });
    }

    /** Back on Android 13 and later (manifest enableOnBackInvokedCallback): the predictive gesture's progress from 14 (OnBackAnimationCallback), the
     *  back itself before; older systems send the back key, which SDL traps (shell_sdl.cpp) and the window HAL sends as a signal. */
    void registerBack() {
        if (Build.VERSION.SDK_INT >= 34) {
            android.window.OnBackAnimationCallback cb = new android.window.OnBackAnimationCallback() {
                @Override public void onBackStarted(android.window.BackEvent e) { nativeSignal("backstart " + (e.getSwipeEdge() == android.window.BackEvent.EDGE_RIGHT ? "right" : "left")); }
                @Override public void onBackProgressed(android.window.BackEvent e) { nativeSignal("backprogress " + e.getProgress()); }
                @Override public void onBackCancelled() { nativeSignal("backcancel"); }
                @Override public void onBackInvoked() { nativeSignal("back"); }
            };
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb);
            backCallback = cb;
        } else if (Build.VERSION.SDK_INT >= 33) {
            android.window.OnBackInvokedCallback cb = new android.window.OnBackInvokedCallback() {
                @Override public void onBackInvoked() { nativeSignal("back"); }
            };
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb);
            backCallback = cb;
        }
    }

    /** No back handler of the program took it: the system's back (Android 12 and later move a root activity's task to the back). */
    void systemBack() {
        if (Build.VERSION.SDK_INT >= 31 || backCallback != null) moveTaskToBack(true);
        else SDLActivity.manualBackButton();
    }

    @Override
    protected boolean onUnhandledMessage(int command, Object param) {   // the window's brightness, steady clocks, on the UI thread (zn/app.h)
        if (command == SUSTAINED && param instanceof Integer) { moving = (Integer) param != 0; sustain(); return true; }
        if (command != BRIGHTNESS || !(param instanceof Integer)) return super.onUnhandledMessage(command, param);
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.screenBrightness = (Integer) param < 0 ? -1f : (Integer) param / 255f;   // -1: the system's
        getWindow().setAttributes(lp);
        return true;
    }

    /** zinc:sys device(query, arg) of the program, from its thread (android_glue.cpp): answered at once, done on the UI thread. */
    static String zincCommand(final String q, final String a) {
        final ZincActivity act = self;
        if (act == null) return "0";
        if (q.equals("battery")) return battery(act);   // a query: answered here, on the program's thread
        if (q.equals("idiom")) return idiom(act);
        act.runOnUiThread(new Runnable() { @Override public void run() { act.command(q, a); } });
        return q.equals("performance") && !sustainedSupported(act) ? "0" : "1";
    }

    /** zinc:device-info's kind (sys_host.cpp deviceRecord): tv in the television UI mode, tablet from a smallest width of 600 dp (Android's sw600dp), else phone. */
    static String idiom(android.content.Context c) {
        android.app.UiModeManager ui = (android.app.UiModeManager) c.getSystemService(android.content.Context.UI_MODE_SERVICE);
        if (ui != null && ui.getCurrentModeType() == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION) return "tv";
        return c.getResources().getConfiguration().smallestScreenWidthDp >= 600 ? "tablet" : "phone";
    }

    /** navigator.getBattery()'s answer from the sticky ACTION_BATTERY_CHANGED intent: "" without a battery. */
    static String battery(android.content.Context c) {
        android.content.Intent i = c.registerReceiver(null, new android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED));
        if (i == null || !i.getBooleanExtra(android.os.BatteryManager.EXTRA_PRESENT, true)) return "";
        int level = i.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1), scale = i.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1);
        if (level < 0 || scale <= 0) return "";
        int plugged = i.getIntExtra(android.os.BatteryManager.EXTRA_PLUGGED, 0), t = i.getIntExtra(android.os.BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
        String src = plugged == android.os.BatteryManager.BATTERY_PLUGGED_USB ? "usb" : plugged == android.os.BatteryManager.BATTERY_PLUGGED_WIRELESS ? "wireless" : plugged != 0 ? "ac" : "none";
        return String.format(java.util.Locale.ROOT, "{\"level\":%.3f,\"charging\":%b,\"source\":\"%s\",\"chargingTime\":-1,\"dischargingTime\":-1%s}",
            level / (double) scale, plugged != 0, src, t == Integer.MIN_VALUE ? "" : String.format(java.util.Locale.ROOT, ",\"temperature\":%.1f", t / 10.0));
    }

    void command(String q, String a) {
        switch (q) {
            case "haptic": haptic(a); break;
            case "statusbar": statusBar(a.split(" ")); break;
            case "exitapp": systemBack(); break;
            case "textinput": ZincEdit.sync(a); break;
            case "keyboard-traits": ZincEdit.traits(a); break;
            case "a11y": ZincAccessibility.apply(a); break;
            case "performance": programFast = a.equals("1"); sustain(); break;
            case "orientation":   // screen.orientation.lock, a script's rotate
                setRequestedOrientation(a.startsWith("portrait") ? android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                    : a.startsWith("landscape") ? android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE : android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                break;
            default: break;
        }
    }

    void haptic(String a) {
        View v = getWindow().getDecorView();
        if (a.startsWith("vibrate ")) {
            int ms = Integer.parseInt(a.substring(8).trim());
            Vibrator vib = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            try {
                if (vib == null) return;
                if (ms <= 0) vib.cancel();
                else if (Build.VERSION.SDK_INT >= 26) vib.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                else vib.vibrate(ms);
            } catch (SecurityException e) {   // no VIBRATE permission in the manifest: a haptic tick instead
                v.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
            }
            return;
        }
        int k = HapticFeedbackConstants.KEYBOARD_TAP;
        if (a.equals("impact light") || a.equals("impact soft")) k = HapticFeedbackConstants.VIRTUAL_KEY;
        else if (a.equals("impact heavy") || a.equals("impact rigid")) k = HapticFeedbackConstants.LONG_PRESS;
        else if (a.equals("selection")) k = Build.VERSION.SDK_INT >= 34 ? HapticFeedbackConstants.SEGMENT_TICK : HapticFeedbackConstants.CLOCK_TICK;
        else if (a.startsWith("notification")) {
            boolean bad = a.endsWith("error") || a.endsWith("warning");
            k = Build.VERSION.SDK_INT >= 30 ? (bad ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.CONFIRM) : HapticFeedbackConstants.LONG_PRESS;
        }
        v.performHapticFeedback(k);
    }

    private boolean barStyled;   // the program chose the bar's icons (StatusBar barStyle): the theme no longer does
    /** The bars' icons dark on a light theme, light on a dark one, as a DayNight app's (the program draws under the bars, edge-to-edge). */
    void barIcons(Configuration c) {
        if (Build.VERSION.SDK_INT < 30 || getWindow().getInsetsController() == null) return;
        boolean night = (c.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
        getWindow().getInsetsController().setSystemBarsAppearance(night ? 0 : light, light);
    }

    /** STYLE HIDDEN COLOR TRANSLUCENT, as zinc:react-native StatusBar sends it. ponytail: translucent is the edge-to-edge window's own state. */
    void statusBar(String[] p) {
        Window w = getWindow();
        View d = w.getDecorView();
        boolean hidden = p.length > 1 && p[1].equals("1");
        boolean darkIcons = p.length > 0 && p[0].equals("dark-content");
        barStyled = p.length > 0 && !p[0].equals("default");
        if (!barStyled) barIcons(getResources().getConfiguration());
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                if (hidden) c.hide(WindowInsets.Type.statusBars()); else c.show(WindowInsets.Type.statusBars());
                if (barStyled) c.setSystemBarsAppearance(darkIcons ? WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS : 0, WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS);
            }
        } else {
            int f = d.getSystemUiVisibility();
            f = hidden ? f | View.SYSTEM_UI_FLAG_FULLSCREEN : f & ~View.SYSTEM_UI_FLAG_FULLSCREEN;
            if (Build.VERSION.SDK_INT >= 23) f = darkIcons ? f | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR : f & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            d.setSystemUiVisibility(f);
        }
        if (p.length > 2 && !p[2].equals("-") && Build.VERSION.SDK_INT < 35) {   // Android 15 draws the app under the bar (edge-to-edge): no colour of its own
            try { w.setStatusBarColor(Color.parseColor(p[2])); } catch (IllegalArgumentException e) { /* a colour Android cannot read: kept */ }
        }
    }
}
