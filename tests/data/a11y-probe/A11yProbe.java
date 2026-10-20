package dev.zinc.probe;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.content.Intent;
import android.os.Bundle;
import android.view.accessibility.AccessibilityNodeInfo;

/**
 * An accessibility client for the screen reader bridge (ZN-630, docs/reports/zinc-next-a11y-bridges.md): it reads the app's tree through the
 * system, as TalkBack does, and presses a node by the accessibility API (ACTION_CLICK), not by a touch. In an exported project (zinc export
 * --target android): copy this file to app/src/androidTest/java/dev/zinc/probe/, add `testInstrumentationRunner "dev.zinc.probe.A11yProbe"`
 * to defaultConfig, `./gradlew assembleDebug assembleDebugAndroidTest`, install both APKs, then
 *   adb shell am instrument -w -e activity <package>.<Activity> -e env 'SHOWCASE_NET=mock' -e press Forms -e expect 'Sign up' <package>.test/dev.zinc.probe.A11yProbe
 * It starts the activity, waits for the node labelled `press`, clicks it through AccessibilityNodeInfo.performAction, and passes when a node
 * labelled `expect` shows up; the trees before and after go to the result as `before` and `after` (one node per line, indented by depth).
 */
public final class A11yProbe extends Instrumentation {
    private Bundle args;

    @Override
    public void onCreate(Bundle arguments) {
        args = arguments;
        super.onCreate(arguments);
        start();
    }

    @Override
    public void onStart() {
        Bundle out = new Bundle();
        try {
            Intent i = new Intent(Intent.ACTION_MAIN);
            i.setClassName(getTargetContext().getPackageName(), args.getString("activity"));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (args.getString("env") != null) i.putExtra("zinc.env", args.getString("env"));
            getTargetContext().startActivity(i);
            UiAutomation ui = getUiAutomation();
            AccessibilityNodeInfo target = waitFor(ui, args.getString("press"), 20000);
            out.putString("before", tree(ui.getRootInActiveWindow(), 0));
            if (target == null) { out.putString("result", "FAIL no node labelled " + args.getString("press")); finish(1, out); return; }
            boolean done = target.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            AccessibilityNodeInfo shown = waitFor(ui, args.getString("expect"), 10000);
            out.putString("after", tree(ui.getRootInActiveWindow(), 0));
            out.putString("result", (done && shown != null ? "PASS" : "FAIL") + " performAction(ACTION_CLICK) on '" + args.getString("press") + "' answered " + done
                + ", '" + args.getString("expect") + "' " + (shown != null ? "shown" : "not shown"));
            finish(done && shown != null ? 0 : 1, out);
        } catch (Exception e) {
            out.putString("result", "FAIL " + e);
            finish(1, out);
        }
    }

    private static AccessibilityNodeInfo waitFor(UiAutomation ui, String label, long ms) throws InterruptedException {
        for (long t = 0; t < ms; t += 250) {
            AccessibilityNodeInfo n = find(ui.getRootInActiveWindow(), label);
            if (n != null) return n;
            Thread.sleep(250);
        }
        return null;
    }

    private static String labelOf(AccessibilityNodeInfo n) {
        CharSequence s = n.getContentDescription() != null ? n.getContentDescription() : n.getText();
        return s == null ? "" : s.toString();
    }

    private static AccessibilityNodeInfo find(AccessibilityNodeInfo n, String label) {
        if (n == null) return null;
        if (label.equals(labelOf(n)) && n.isVisibleToUser()) return n;
        for (int i = 0; i < n.getChildCount(); i++) { AccessibilityNodeInfo r = find(n.getChild(i), label); if (r != null) return r; }
        return null;
    }

    private static String tree(AccessibilityNodeInfo n, int depth) {
        if (n == null) return "";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < depth; i++) b.append("  ");
        String c = n.getClassName() == null ? "" : n.getClassName().toString();
        b.append(c.substring(c.lastIndexOf('.') + 1));
        if (!labelOf(n).isEmpty()) b.append(" \"").append(labelOf(n)).append('"');
        if (!n.isVisibleToUser()) b.append(" (offscreen)");
        b.append('\n');
        for (int i = 0; i < n.getChildCount(); i++) b.append(tree(n.getChild(i), depth + 1));
        return b.toString();
    }
}
