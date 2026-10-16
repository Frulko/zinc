package dev.zinc.app;

import android.app.Activity;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
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
 * scale, reduce motion, the keyboard's height, the predictive back gesture; from it: zincCommand(query, arg) (zinc:sys device(), through
 * src/app/android_glue.cpp): haptics, the status bar, the system's back, the text input connection's state and the keyboard's traits.
 * Unproven on a device (written 2026-10-16 without one in the loop): the cross-platform pass checks it (next/backlog/later.md).
 */
public class ZincActivity extends SDLActivity {
    /** The SDL_SendAndroidMessage command of the window's brightness (include/zn/app.h ZN_APP_ANDROID_BRIGHTNESS). */
    static final int BRIGHTNESS = 0x8001;
    static ZincActivity self;
    static native void nativeInit();
    public static native void nativeSignal(String line);

    private int keyboardShown = -1;
    private Object backCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        self = this;
        nativeInit();
        sendConfiguration(getResources().getConfiguration());
        ZincEdit.install(this);
        watchKeyboard();
        registerBack();
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
    }

    /** The surface's units: the window's pixels over the zoom of targets/macos/hal_sdl.cpp (the display scale, whole, 1 below 1.5). */
    float zoom() {
        float d = getResources().getDisplayMetrics().density;
        return d >= 1.5f ? Math.round(d) : 1f;
    }

    void sendConfiguration(Configuration c) {
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
    protected boolean onUnhandledMessage(int command, Object param) {   // the window's brightness, on the UI thread (zn/app.h)
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
        act.runOnUiThread(new Runnable() { @Override public void run() { act.command(q, a); } });
        return "1";
    }

    void command(String q, String a) {
        switch (q) {
            case "haptic": haptic(a); break;
            case "statusbar": statusBar(a.split(" ")); break;
            case "exitapp": systemBack(); break;
            case "textinput": ZincEdit.sync(a); break;
            case "keyboard-traits": ZincEdit.traits(a); break;
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

    /** STYLE HIDDEN COLOR TRANSLUCENT, as zinc:react-native StatusBar sends it. ponytail: translucent is the edge-to-edge window's own state. */
    void statusBar(String[] p) {
        Window w = getWindow();
        View d = w.getDecorView();
        boolean hidden = p.length > 1 && p[1].equals("1");
        boolean darkIcons = p.length > 0 && p[0].equals("dark-content");
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                if (hidden) c.hide(WindowInsets.Type.statusBars()); else c.show(WindowInsets.Type.statusBars());
                c.setSystemBarsAppearance(darkIcons ? WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS : 0, WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS);
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
