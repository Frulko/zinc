package dev.zinc.mapping;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.SurfaceTexture;
import android.media.MediaMetadataRetriever;
import android.media.MediaPlayer;
import android.opengl.GLES20;
import android.opengl.GLUtils;
import android.util.Log;
import android.view.Surface;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.Locale;

/**
 * One media file of a zinc:mapping layer. A video plays through MediaPlayer, the system's own decoder and audio output (API 1), into a
 * SurfaceTexture (API 11): the hardware decoder's pictures reach the GPU without a copy, which is what lets a 2014 chip map 1080p, and picture
 * and sound stay in sync by themselves. A still image is decoded on its own thread and uploaded on the GL thread.
 * Everything but the constructor's work on the player and the listeners runs on the GL thread (mapping.android.cpp).
 */
final class ZincMappingMedia {
    private static final String TAG = "zinc";
    private static final int MAX_IMAGE_SIZE = 2048;   // a Mali-400's texture limit is 4096, its memory is the real one

    // the fields of update()'s result
    private static final int READY = 0, WIDTH = 1, HEIGHT = 2, IS_IMAGE = 3, SCALE_S = 4, SCALE_T = 5, OFFSET_S = 6, OFFSET_T = 7;

    private final int texture;
    private SurfaceTexture surfaceTexture;
    private Surface surface;
    private MediaPlayer player;
    private FileInputStream file;
    private final float[] transform = new float[16];
    private volatile boolean frameWaiting;
    private volatile boolean prepared;
    private boolean frameShown;
    private volatile Bitmap decodedImage;
    private boolean imageShown;
    private int width, height;

    private static final int THUMBNAIL_WIDTH = 320, THUMBNAIL_QUALITY = 80;
    private static final long THUMBNAIL_AT_US = 1000000;
    private static final Object THUMBNAIL_TURN = new Object();   // one at a time: each takes a decoder from the show

    /** A JPEG of a video's picture one second in, at the lowest priority; a file that gives none leaves no file. */
    static void writeThumbnail(final String path, final String out) {
        Thread worker = new Thread(new Runnable() {
            @Override public void run() {
                synchronized (THUMBNAIL_TURN) {
                    MediaMetadataRetriever retriever = new MediaMetadataRetriever();
                    try {
                        retriever.setDataSource(path);
                        Bitmap frame = retriever.getFrameAtTime(THUMBNAIL_AT_US);
                        if (frame == null) return;
                        Bitmap small = Bitmap.createScaledBitmap(frame, THUMBNAIL_WIDTH, THUMBNAIL_WIDTH * frame.getHeight() / frame.getWidth(), true);
                        frame.recycle();
                        File coming = new File(out + ".part");
                        FileOutputStream stream = new FileOutputStream(coming);
                        small.compress(Bitmap.CompressFormat.JPEG, THUMBNAIL_QUALITY, stream);
                        stream.close();
                        small.recycle();
                        coming.renameTo(new File(out));
                    } catch (Exception e) {
                        Log.w(TAG, "no thumbnail for " + path + ": " + e);
                    } finally {
                        retriever.release();
                    }
                }
            }
        }, "mapping-thumbnail");
        worker.setPriority(Thread.MIN_PRIORITY);
        worker.start();
    }

    ZincMappingMedia(int texture, String path, boolean loop, float volume) {
        this.texture = texture;
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp")) decodeImageInBackground(path);
        else startVideo(path, loop, volume);
    }

    private void decodeImageInBackground(final String path) {
        new Thread(new Runnable() {
            @Override public void run() {
                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(path, bounds);
                BitmapFactory.Options options = new BitmapFactory.Options();
                while (Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > MAX_IMAGE_SIZE) {
                    options.inSampleSize = Math.max(1, options.inSampleSize) * 2;
                }
                Bitmap image = BitmapFactory.decodeFile(path, options);
                if (image == null) Log.e(TAG, "mapping: cannot read image " + path);
                decodedImage = image;
            }
        }, "mapping-image").start();
    }

    private void startVideo(String path, boolean loop, float volume) {
        try {
            surfaceTexture = new SurfaceTexture(texture);
            surfaceTexture.setOnFrameAvailableListener(new SurfaceTexture.OnFrameAvailableListener() {
                @Override public void onFrameAvailable(SurfaceTexture ignored) { frameWaiting = true; }
            });
            surface = new Surface(surfaceTexture);
            player = new MediaPlayer();
            // the descriptor, not the path: the media server cannot read the app's private folder
            file = new FileInputStream(path);
            player.setDataSource(file.getFD());
            player.setSurface(surface);
            player.setLooping(loop);
            player.setVolume(volume, volume);
            player.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
                @Override public void onPrepared(MediaPlayer started) {
                    width = started.getVideoWidth();
                    height = started.getVideoHeight();
                    prepared = true;
                    started.start();
                }
            });
            final String shownPath = path;
            player.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override public boolean onError(MediaPlayer failed, int what, int extra) {
                    Log.e(TAG, "mapping: cannot play " + shownPath + " (" + what + ", " + extra + ")");
                    return true;
                }
            });
            player.prepareAsync();
        } catch (Exception e) {
            Log.e(TAG, "mapping: cannot open " + path + ": " + e);
        }
    }

    /** Takes the latest picture onto the texture and describes it in `out` (see the constants). Called once per drawn frame. */
    void update(float[] out) {
        if (surfaceTexture != null) {
            if (frameWaiting) {
                frameWaiting = false;
                surfaceTexture.updateTexImage();
                surfaceTexture.getTransformMatrix(transform);
                frameShown = true;
            }
            // Only scale and offset: a rotated clip's matrix is not read. ponytail: re-encode such a clip; read the whole matrix when one matters.
            out[READY] = frameShown && prepared ? 1 : 0;
            out[WIDTH] = width;
            out[HEIGHT] = height;
            out[IS_IMAGE] = 0;
            out[SCALE_S] = transform[0];
            out[SCALE_T] = transform[5];
            out[OFFSET_S] = transform[12];
            out[OFFSET_T] = transform[13];
            return;
        }
        Bitmap image = decodedImage;
        if (image != null && !imageShown) {
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texture);
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
            GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, image, 0);
            width = image.getWidth();
            height = image.getHeight();
            image.recycle();
            decodedImage = null;
            imageShown = true;
        }
        out[READY] = imageShown ? 1 : 0;
        out[WIDTH] = width;
        out[HEIGHT] = height;
        out[IS_IMAGE] = 1;
    }

    void setVolume(float volume) { if (player != null) player.setVolume(volume, volume); }

    void setLooping(boolean loop) { if (player != null) player.setLooping(loop); }

    void release() {
        if (player != null) player.release();
        if (surface != null) surface.release();
        if (surfaceTexture != null) surfaceTexture.release();
        try {
            if (file != null) file.close();
        } catch (Exception e) {
            Log.w(TAG, "mapping: closing a media file: " + e);
        }
    }
}
