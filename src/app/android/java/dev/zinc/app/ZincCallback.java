package dev.zinc.app;

/**
 * A function of the program that a plugin's Java or Kotlin code calls back (zinc native-gen --android, docs/plugins.md "Phones"). call() takes the
 * values in the order of the spec (Integer, Double, Boolean, String) and may be called from any thread: the program runs it on its own thread.
 */
public final class ZincCallback {
    private final long handle;

    ZincCallback(long handle) { this.handle = handle; }

    public void call(Object... args) { nativeCall(handle, args); }

    private static native void nativeCall(long handle, Object[] args);
}
