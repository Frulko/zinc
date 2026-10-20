package dev.zinc.app;

import android.content.Context;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.util.SparseArray;
import android.view.MotionEvent;
import android.view.View;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityManager;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityNodeProvider;

import java.util.ArrayList;

/**
 * zinc:ui's accessibility tree for TalkBack and the other accessibility services (ZN-630, docs/reports/zinc-next-a11y-bridges.md): the nodes the
 * program sends (zinc:sys device("a11y", lines), lib/std/ui.ts syncA11y) are virtual views of SDL's surface, through an AccessibilityNodeProvider
 * (Flutter's AccessibilityBridge does the same). ACTION_CLICK, ACTION_ACCESSIBILITY_FOCUS and the scroll actions go back to the program as the
 * signals `a11yactivate ID`, `a11yfocus ID` and `a11yscroll ID 1|-1`; with touch exploration on, a finger over a node gives it the accessibility focus. The program sends nothing
 * until a service listens (`a11y 1`, from AccessibilityManager, or the first query of the tree by a client the manager did not announce). Every
 * method runs on the UI thread (ZincActivity.command posts the updates there).
 */
final class ZincAccessibility extends View.AccessibilityDelegate {
    static final int DISABLED = 1, CLICK = 2, CHECKABLE = 4, CHECKED = 8, EDIT = 16, SELECTED = 32, OFFSCREEN = 64, FOCUSED = 128, SCROLL = 256;

    private static final class Node {
        int parent, flags, x, y, w, h;
        String role = "", label = "", value = "", hint = "";
        final ArrayList<Integer> children = new ArrayList<>();
    }

    private static ZincAccessibility self;
    private final ZincActivity activity;
    private final View host;
    private final AccessibilityManager manager;
    private final SparseArray<Node> nodes = new SparseArray<>();
    private final ArrayList<Integer> top = new ArrayList<>();   // the nodes without a parent, in reading order
    private int[] order = new int[0];
    private int focused = -1;                                  // the accessibility focus (a node id), -1 none
    private boolean listening;
    private final Provider provider = new Provider();

    private ZincAccessibility(ZincActivity a, View surface) {
        activity = a;
        host = surface;
        manager = (AccessibilityManager) a.getSystemService(Context.ACCESSIBILITY_SERVICE);
    }

    /** After SDL made its surface (ZincActivity.onCreate). */
    static void install(ZincActivity a, View surface) {
        if (surface == null) return;
        self = new ZincAccessibility(a, surface);
        surface.setAccessibilityDelegate(self);
        surface.setOnHoverListener(self::hover);
        if (self.manager != null) {
            self.manager.addAccessibilityStateChangeListener(self::listen);
            self.listen(self.manager.isEnabled());
        }
    }

    private void listen(boolean on) {
        if (on == listening) return;
        listening = on;
        ZincActivity.nativeSignal(on ? "a11y 1" : "a11y 0");
        if (!on) { nodes.clear(); top.clear(); order = new int[0]; focused = -1; }
    }

    /** The program's changes: `n ID PARENT FLAGS X Y W H\tROLE\tLABEL\tVALUE\tHINT`, `d ID`, `o ID ID...` (lib/std/ui.ts syncA11y). */
    static void apply(String text) { if (self != null) self.update(text); }

    private void update(String text) {
        if (!listening) return;   // turned off since the program sent it
        boolean structure = false;
        for (String line : text.split("\n")) {
            if (line.startsWith("n ")) {
                String[] f = line.split("\t", -1), head = f[0].split(" ");
                if (head.length < 8 || f.length < 5) continue;
                int id = Integer.parseInt(head[1]);
                Node n = nodes.get(id);
                if (n == null) { n = new Node(); nodes.put(id, n); structure = true; }
                int parent = Integer.parseInt(head[2]);
                if (parent != n.parent) structure = true;
                n.parent = parent;
                n.flags = Integer.parseInt(head[3]);
                n.x = Integer.parseInt(head[4]); n.y = Integer.parseInt(head[5]); n.w = Integer.parseInt(head[6]); n.h = Integer.parseInt(head[7]);
                n.role = f[1]; n.label = f[2]; n.value = f[3]; n.hint = f[4];
            } else if (line.startsWith("d ")) {
                int id = Integer.parseInt(line.substring(2).trim());
                nodes.remove(id);
                if (focused == id) focused = -1;
                structure = true;
            } else if (line.startsWith("o")) {
                String[] ids = line.substring(1).trim().split(" ");
                order = new int[line.trim().length() > 1 ? ids.length : 0];
                for (int i = 0; i < order.length; i++) order[i] = Integer.parseInt(ids[i]);
                structure = true;
            }
        }
        if (structure) {   // children lists in reading order
            top.clear();
            for (int i = 0; i < nodes.size(); i++) nodes.valueAt(i).children.clear();
            for (int id : order) {
                Node n = nodes.get(id), p = n != null ? nodes.get(n.parent) : null;
                if (n == null) continue;
                if (p != null) p.children.add(id); else top.add(id);
            }
        }
        AccessibilityEvent e = event(AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED);
        e.setContentChangeTypes(AccessibilityEvent.CONTENT_CHANGE_TYPE_SUBTREE);
        e.setSource(host);
        send(e);
    }

    @Override
    public AccessibilityNodeProvider getAccessibilityNodeProvider(View v) { return provider; }

    /** Touch exploration: the node under the finger takes the accessibility focus (ExploreByTouchHelper's rule). */
    private boolean hover(View v, MotionEvent ev) {
        if (manager == null || !manager.isTouchExplorationEnabled() || nodes.size() == 0) return false;
        if (ev.getAction() != MotionEvent.ACTION_HOVER_ENTER && ev.getAction() != MotionEvent.ACTION_HOVER_MOVE) return true;
        float z = activity.zoom();
        int hit = -1;
        for (int id : order) {   // the last listed node that holds the point: the deepest, the one painted above
            Node n = nodes.get(id);
            if (n != null && (n.flags & OFFSCREEN) == 0 && ev.getX() >= n.x * z && ev.getX() < (n.x + n.w) * z && ev.getY() >= n.y * z && ev.getY() < (n.y + n.h) * z) hit = id;
        }
        for (Node p; hit >= 0 && (p = nodes.get(nodes.get(hit).parent)) != null && (p.flags & CLICK) != 0; ) hit = nodes.get(hit).parent;   // a button's text: the button
        if (hit >= 0 && hit != focused) provider.performAction(hit, AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null);
        return true;
    }

    @SuppressWarnings("deprecation")
    private AccessibilityEvent event(int type) {
        AccessibilityEvent e = Build.VERSION.SDK_INT >= 30 ? new AccessibilityEvent(type) : AccessibilityEvent.obtain(type);
        e.setPackageName(activity.getPackageName());
        return e;
    }

    private void send(AccessibilityEvent e) {
        if (host.getParent() != null && manager != null && manager.isEnabled()) host.getParent().requestSendAccessibilityEvent(host, e);
    }

    private void sendFor(int id, int type) {
        Node n = nodes.get(id);
        AccessibilityEvent e = event(type);
        e.setClassName(classOf(n != null ? n.role : ""));
        if (n != null && !n.label.isEmpty()) e.getText().add(n.label);
        e.setSource(host, id);
        send(e);
    }

    /** The widget class TalkBack names a node by ("button", "edit box", "checkbox"...). */
    static String classOf(String role) {
        switch (role) {
            case "button": case "link": case "tab": case "menuitem": return "android.widget.Button";
            case "text": case "heading": case "status": return "android.widget.TextView";
            case "textbox": case "searchbox": return "android.widget.EditText";
            case "checkbox": return "android.widget.CheckBox";
            case "radio": return "android.widget.RadioButton";
            case "switch": return "android.widget.Switch";
            case "img": case "image": return "android.widget.ImageView";
            case "scrollarea": case "list": return "android.widget.ScrollView";
            case "progressbar": return "android.widget.ProgressBar";
            case "slider": return "android.widget.SeekBar";
            default: return "android.view.View";
        }
    }

    private final class Provider extends AccessibilityNodeProvider {
        @Override
        public AccessibilityNodeInfo createAccessibilityNodeInfo(int id) {
            if (id == View.NO_ID) {
                // a client the manager did not announce (an instrumentation's UiAutomation) reads the tree: from now on the program sends it
                if (!listening) listen(true);
                AccessibilityNodeInfo info = AccessibilityNodeInfo.obtain(host);
                host.onInitializeAccessibilityNodeInfo(info);
                for (int c : top) info.addChild(host, c);
                return info;
            }
            Node n = nodes.get(id);
            if (n == null) return null;
            AccessibilityNodeInfo info = AccessibilityNodeInfo.obtain(host, id);
            info.setPackageName(activity.getPackageName());
            info.setClassName(classOf(n.role));
            info.setSource(host, id);
            if (n.parent >= 0 && nodes.get(n.parent) != null) info.setParent(host, n.parent); else info.setParent(host);
            for (int c : n.children) info.addChild(host, c);
            int[] at = new int[2];
            host.getLocationOnScreen(at);
            float z = activity.zoom();
            info.setBoundsInScreen(new Rect(at[0] + Math.round(n.x * z), at[1] + Math.round(n.y * z), at[0] + Math.round((n.x + n.w) * z), at[1] + Math.round((n.y + n.h) * z)));
            info.setVisibleToUser((n.flags & OFFSCREEN) == 0);
            info.setImportantForAccessibility(true);
            boolean on = (n.flags & DISABLED) == 0, edit = (n.flags & EDIT) != 0, click = (n.flags & CLICK) != 0;
            info.setEnabled(on);
            if (edit) {
                info.setEditable(true);
                info.setText(n.value);
                String hint = !n.label.isEmpty() ? n.label : n.hint;
                if (Build.VERSION.SDK_INT >= 26) info.setHintText(hint); else if (n.value.isEmpty()) info.setContentDescription(hint);
            } else if (n.role.equals("text") || n.role.equals("heading")) {
                info.setText(n.label);
            } else if (!n.label.isEmpty()) {
                info.setContentDescription(n.label);
            }
            if (!n.value.isEmpty() && !edit && Build.VERSION.SDK_INT >= 30) info.setStateDescription(n.value);
            if (n.role.equals("heading") && Build.VERSION.SDK_INT >= 28) info.setHeading(true);
            info.setCheckable((n.flags & CHECKABLE) != 0);
            info.setChecked((n.flags & CHECKED) != 0);
            info.setSelected((n.flags & SELECTED) != 0);
            info.setFocused((n.flags & FOCUSED) != 0);
            info.setFocusable(on && (click || edit));
            info.setClickable(on && (click || edit));
            if (on && (click || edit)) info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_CLICK);
            if ((n.flags & SCROLL) != 0) {   // TalkBack scrolls a list on when its swipes reach the last node it shows
                info.setScrollable(true);
                info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_FORWARD);
                info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_BACKWARD);
            }
            if (id == focused) {
                info.setAccessibilityFocused(true);
                info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_CLEAR_ACCESSIBILITY_FOCUS);
            } else {
                info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_ACCESSIBILITY_FOCUS);
            }
            return info;
        }

        @Override
        public boolean performAction(int id, int action, Bundle args) {
            if (id == View.NO_ID) return host.performAccessibilityAction(action, args);
            Node n = nodes.get(id);
            if (n == null) return false;
            switch (action) {
                case AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS:
                    if (focused == id) return false;
                    if (focused >= 0) sendFor(focused, AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUS_CLEARED);
                    focused = id;
                    host.invalidate();
                    sendFor(id, AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUSED);
                    ZincActivity.nativeSignal("a11yfocus " + id);
                    return true;
                case AccessibilityNodeInfo.ACTION_CLEAR_ACCESSIBILITY_FOCUS:
                    if (focused != id) return false;
                    focused = -1;
                    sendFor(id, AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUS_CLEARED);
                    return true;
                case AccessibilityNodeInfo.ACTION_CLICK:
                    if ((n.flags & DISABLED) != 0 || (n.flags & (CLICK | EDIT)) == 0) return false;
                    ZincActivity.nativeSignal("a11yactivate " + id);
                    sendFor(id, AccessibilityEvent.TYPE_VIEW_CLICKED);
                    return true;
                case AccessibilityNodeInfo.ACTION_SCROLL_FORWARD:
                case AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD:
                    if ((n.flags & SCROLL) == 0) return false;
                    ZincActivity.nativeSignal("a11yscroll " + id + (action == AccessibilityNodeInfo.ACTION_SCROLL_FORWARD ? " 1" : " -1"));
                    return true;
                default:
                    return false;
            }
        }

        @Override
        public AccessibilityNodeInfo findFocus(int focus) {
            return focus == AccessibilityNodeInfo.FOCUS_ACCESSIBILITY && focused >= 0 ? createAccessibilityNodeInfo(focused) : null;
        }
    }
}
