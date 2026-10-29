// The Android screen of Sidecar: a full-screen Surface the native receiver (jni/receiver.c) draws the Mac's picture into, and the Mac's
// sound on the next port (played by an AudioTrack). The Mac reaches both on the USB cable through adb (sidecar-screen --host adb).
package dev.zinc.sidecar;

import android.app.Activity;
import android.graphics.Color;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;

public class Screen extends Activity implements SurfaceHolder.Callback {
    static { System.loadLibrary("sidecar"); }
    static native void start(android.view.Surface s, int w, int h, String name);
    static native void stop();
    static native boolean connected();
    static native void videoSurface(android.view.Surface s, int w, int h);
    static native void input(int kind, int type, int id, int a, int b, int c);

    private static Screen self;
    private SurfaceView video;   // the Mac's video (H.264, decoded by MediaCodec into it) over its place, GONE without one

    private TextView waiting;
    private final Handler handler = new Handler();

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        FrameLayout root = new FrameLayout(this);
        SurfaceView view = new SurfaceView(this);
        view.getHolder().addCallback(this);
        root.addView(view);
        view.setOnTouchListener(new View.OnTouchListener() { public boolean onTouch(View v, MotionEvent e) { touch(e); return true; } });
        video = new SurfaceView(this);
        video.setZOrderMediaOverlay(true);   // over the picture's Surface
        video.setVisibility(View.GONE);
        video.getHolder().addCallback(new SurfaceHolder.Callback() {
            public void surfaceCreated(SurfaceHolder h) {}
            public void surfaceChanged(SurfaceHolder h, int format, int w, int hh) { videoSurface(h.getSurface(), w, hh); }
            public void surfaceDestroyed(SurfaceHolder h) { videoSurface(null, 0, 0); }
        });
        root.addView(video, new FrameLayout.LayoutParams(1, 1, Gravity.TOP | Gravity.LEFT));
        self = this;
        waiting = new TextView(this);
        waiting.setText("Sidecar\n\nPlug this device into the Mac with its USB cable (USB debugging on),\nthen choose it in Sidecar on the Mac (Android on USB).");
        waiting.setTextColor(Color.LTGRAY); waiting.setTextSize(20); waiting.setGravity(Gravity.CENTER); waiting.setBackgroundColor(Color.BLACK);
        root.addView(waiting);
        setContentView(root);
        sound();   // its port listens before the picture's: a Mac that connects finds both
        handler.post(new Runnable() { public void run() {
            waiting.setVisibility(connected() ? View.GONE : View.VISIBLE);
            handler.postDelayed(this, 500);
        } });
    }
    @Override public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }
    // the touches, the Mac's mouse (the picture's Surface fills the screen: a view pixel is a stream pixel). One finger is the left
    // button (its press waits 60 ms: a second finger then makes it a scroll, not a click), two fingers scroll
    private int finger = -1; private boolean fingers, pending; private float fx, fy, cx, cy;
    private final Runnable pressNow = new Runnable() { public void run() { press(); } };
    private void press() { handler.removeCallbacks(pressNow); if (pending) { pending = false; input(2, 0x10, 0, (int) fx, (int) fy, 0); } }
    private void centre(MotionEvent e, int leaving) {
        float x = 0, y = 0; int n = 0;
        for (int i = 0; i < e.getPointerCount(); i++) if (i != leaving) { x += e.getX(i); y += e.getY(i); n++; }
        if (n > 0) { cx = x / n; cy = y / n; }
    }
    private void touch(MotionEvent e) {
        switch (e.getActionMasked()) {
        case MotionEvent.ACTION_DOWN:
            finger = e.getPointerId(0); fx = e.getX(); fy = e.getY(); pending = true; handler.postDelayed(pressNow, 60);
            break;
        case MotionEvent.ACTION_POINTER_DOWN:
            if (!fingers) {   // a second finger: a scroll; a press already sent is let go where it was
                if (finger >= 0 && !pending) input(2, 0x11, 0, (int) fx, (int) fy, 0);
                handler.removeCallbacks(pressNow); pending = false; finger = -1; fingers = true;
            }
            centre(e, -1);
            break;
        case MotionEvent.ACTION_MOVE:
            if (finger >= 0) {
                int i = e.findPointerIndex(finger); if (i < 0) break;
                press();
                for (int h = 0; h < e.getHistorySize(); h++) input(2, 0x12, 0, (int) e.getHistoricalX(i, h), (int) e.getHistoricalY(i, h), 0);
                fx = e.getX(i); fy = e.getY(i); input(2, 0x12, 0, (int) fx, (int) fy, 0);
            } else if (fingers) {
                float ox = cx, oy = cy; centre(e, -1);
                input(6, 0, 0, Math.round(cx - ox), Math.round(cy - oy), 0);
            }
            break;
        case MotionEvent.ACTION_POINTER_UP:
            centre(e, e.getActionIndex());
            break;
        case MotionEvent.ACTION_UP: case MotionEvent.ACTION_CANCEL:
            if (finger >= 0) { press(); input(2, 0x11, 0, (int) e.getX(), (int) e.getY(), 0); }
            finger = -1; fingers = false;
            break;
        }
    }
    /** The video Surface over the picture's (x, y, w, h), in pixels of the stream (the picture's Surface fills the screen); w 0: none. From the native side. */
    static void place(final int x, final int y, final int w, final int h) {
        final Screen s = self;
        if (s != null) s.handler.post(new Runnable() { public void run() {
            if (w == 0) { s.video.setVisibility(View.GONE); return; }
            FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(w, h, Gravity.TOP | Gravity.LEFT);
            p.leftMargin = x; p.topMargin = y;
            s.video.getHolder().setFixedSize(w, h);
            s.video.setLayoutParams(p);
            s.video.setVisibility(View.VISIBLE);
        } });
    }
    /** The name the owner gave the device (Settings › About), else its model: the Mac names the screen with it. */
    private String deviceName() {
        String n = Settings.Global.getString(getContentResolver(), "device_name");
        return n != null && !n.isEmpty() ? n : Build.MODEL;
    }
    public void surfaceCreated(SurfaceHolder h) {}
    public void surfaceChanged(SurfaceHolder h, int format, int w, int hh) { start(h.getSurface(), w, hh, deviceName()); }
    public void surfaceDestroyed(SurfaceHolder h) { stop(); }

    /** The Mac's sound (app/sidecar/mac/sound.swift): "OK", then "PCM <rate> <channels>" and 16-bit samples, played as they come. */
    private void sound() {
        final ServerSocket ss;
        try { ss = new ServerSocket(7711); } catch (Exception e) { return; }
        new Thread(new Runnable() { public void run() {
            for (;;) {
                try (Socket c = ss.accept()) {
                    OutputStream out = c.getOutputStream(); out.write("OK\n".getBytes()); out.flush();
                    InputStream in = c.getInputStream();
                    StringBuilder line = new StringBuilder();
                    for (int ch; (ch = in.read()) >= 0 && ch != '\n' && line.length() < 100; ) line.append((char) ch);
                    String[] w = line.toString().split(" ");
                    if (w.length != 3 || !w[0].equals("PCM")) continue;
                    int rate = Integer.parseInt(w[1]), chans = Integer.parseInt(w[2]);
                    int cfg = chans == 2 ? AudioFormat.CHANNEL_OUT_STEREO : AudioFormat.CHANNEL_OUT_MONO;
                    int min = AudioTrack.getMinBufferSize(rate, cfg, AudioFormat.ENCODING_PCM_16BIT);
                    AudioTrack t = new AudioTrack(AudioManager.STREAM_MUSIC, rate, cfg, AudioFormat.ENCODING_PCM_16BIT, Math.max(min, rate * chans * 2 / 10), AudioTrack.MODE_STREAM);
                    t.play();
                    byte[] buf = new byte[8192]; int keep = 0;
                    for (int n; (n = in.read(buf, keep, buf.length - keep)) > 0; ) {
                        int all = keep + n, whole = all & ~1;
                        t.write(buf, 0, whole);
                        keep = all - whole; if (keep > 0) buf[0] = buf[whole];
                    }
                    t.stop(); t.release();
                } catch (Exception e) { /* the Mac left: wait for the next */ }
            }
        } }).start();
    }
}
