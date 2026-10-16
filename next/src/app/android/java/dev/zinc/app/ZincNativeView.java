package dev.zinc.app;

import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.RelativeLayout;

import org.libsdl.app.SDLActivity;

/**
 * A plugin's Android view laid over the Zinc surface at a zinc:ui NativeView's box (ZN-749, docs/plugins.md "Native views"): a container added to
 * SDL's layout above its SurfaceView takes the clip, the view inside it the box, so a scroll area cuts the view off. Coordinates are the surface's
 * logical pixels (the window's pixels over ZincActivity.zoom()); the container is moved with translations, and resized only when the clip's size
 * changes. Every method may be called from any thread: the work is posted to the UI thread in order. Touches inside the clip reach the view.
 */
public final class ZincNativeView {
    private final View view;
    private FrameLayout clip;

    /** `view` is created by the plugin (on the UI thread); attach() puts it on screen. */
    public ZincNativeView(View view) { this.view = view; }

    static void ui(Runnable r) {
        ZincActivity a = ZincActivity.current();
        if (a != null) a.runOnUiThread(r);
    }

    public void attach() {
        ui(() -> {
            ViewGroup root = (ViewGroup) SDLActivity.getContentView();
            ZincActivity a = ZincActivity.current();
            if (root == null || a == null || clip != null) return;
            clip = new FrameLayout(a);
            clip.setClipChildren(true);
            clip.addView(view, new FrameLayout.LayoutParams(1, 1));
            root.addView(clip, new RelativeLayout.LayoutParams(1, 1));   // after SDL's surface: drawn above it
        });
    }

    /** The box (x, y, w, h) and the clip (cx, cy, cw, ch) on the surface, in its logical pixels. */
    public void place(double x, double y, double w, double h, double cx, double cy, double cw, double ch) {
        ui(() -> {
            ZincActivity a = ZincActivity.current();
            if (clip == null || a == null) return;
            float z = a.zoom();
            size(clip, (int) Math.round(cw * z), (int) Math.round(ch * z));
            clip.setTranslationX((float) (cx * z));
            clip.setTranslationY((float) (cy * z));
            size(view, (int) Math.round(w * z), (int) Math.round(h * z));
            view.setTranslationX((float) ((x - cx) * z));
            view.setTranslationY((float) ((y - cy) * z));
        });
    }

    public void setShown(boolean on) { ui(() -> { if (clip != null) clip.setVisibility(on ? View.VISIBLE : View.INVISIBLE); }); }

    /** Takes the view off the screen; the plugin destroys it after (on the UI thread, posted after this). */
    public void detach() {
        ui(() -> {
            if (clip == null) return;
            clip.removeView(view);
            ViewGroup p = (ViewGroup) clip.getParent();
            if (p != null) p.removeView(clip);
            clip = null;
        });
    }

    private static void size(View v, int w, int h) {
        ViewGroup.LayoutParams lp = v.getLayoutParams();
        if (lp.width == w && lp.height == h) return;
        lp.width = w;
        lp.height = h;
        v.setLayoutParams(lp);
    }
}
