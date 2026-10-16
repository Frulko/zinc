package org.libsdl.app;

import android.content.Context;
import android.text.Editable;
import android.text.InputType;
import android.text.Selection;
import android.view.KeyEvent;
import android.view.inputmethod.BaseInputConnection;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;
import android.widget.RelativeLayout;

/**
 * Zinc's text input connection on Android (ZN-626, docs/ui.md "Text input on phones"). SDL's hidden editor (SDLDummyEdit) keeps a buffer of its
 * own and turns composition into committed text and backspaces into key events, so the keyboard never sees the field: no suggestions,
 * autocorrect or composition worth the name. This one stands in its place (same view, so SDL still shows and hides it) and mirrors the focused
 * zinc:ui field: the engine sends the field's text, selection and composing run after each change (device('textinput'), ZincActivity.command),
 * and the IME's calls go back as signals (commit, compose, imedelete, imeselect, imeaction: src/host/hal_dispatch.cpp, lib/std/ui.ts).
 * In package org.libsdl.app for SDLDummyEdit's package-private constructor and fields. Unproven on a device (Gboard, a Japanese IME, swipe
 * typing, a password manager): next/backlog/later.md, cross-platform pass.
 */
public class ZincEdit extends SDLDummyEdit {
    static ZincEdit self;
    static String traits = "";
    final Mirror mirror;

    ZincEdit(Context c) { super(c); mirror = new Mirror(this); }

    /** Put in SDL's place before its first text input (ShowTextInputTask makes a SDLDummyEdit only when mTextEdit is null). */
    public static void install(Context c) {
        if (SDLActivity.mLayout == null || SDLActivity.mTextEdit != null) return;
        self = new ZincEdit(c);
        self.setVisibility(GONE);
        SDLActivity.mTextEdit = self;
        SDLActivity.mLayout.addView(self, new RelativeLayout.LayoutParams(0, 0));
    }

    static boolean has(String kv) { return (" " + traits + " ").contains(" " + kv + " "); }
    static String get(String key) {
        for (String w : traits.split(" ")) if (w.startsWith(key + "=")) return w.substring(key.length() + 1);
        return "";
    }

    /** The keyboard the field asks for (lib/std/ui.ts keyboardTraits); a change while it shows restarts the input. */
    public static void traits(String t) {
        if (t.equals(traits)) return;
        traits = t;
        if (self != null && self.getVisibility() == VISIBLE) {
            InputMethodManager imm = (InputMethodManager) self.getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
            imm.restartInput(self);
        }
    }

    /** `caret anchor compA compB` and the value on the next line: the field as the engine has it now. */
    public static void sync(String state) {
        if (self == null) return;
        int nl = state.indexOf('\n');
        if (nl < 0) return;
        String[] n = state.substring(0, nl).split(" ");
        if (n.length < 4) return;
        self.mirror.set(state.substring(nl + 1), Integer.parseInt(n[0]), Integer.parseInt(n[1]), Integer.parseInt(n[2]), Integer.parseInt(n[3]));
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo out) {
        ic = mirror;
        String type = get("type"), cap = get("cap"), ret = get("return"), fill = get("autofill");
        boolean secure = has("secure=1");
        int t;
        if (type.equals("number")) t = InputType.TYPE_CLASS_NUMBER | (secure ? InputType.TYPE_NUMBER_VARIATION_PASSWORD : 0);
        else if (type.equals("decimal")) t = InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL;
        else if (type.equals("phone")) t = InputType.TYPE_CLASS_PHONE;
        else {
            t = InputType.TYPE_CLASS_TEXT;
            if (secure) t |= InputType.TYPE_TEXT_VARIATION_PASSWORD;
            else if (type.equals("email") || fill.equals("email") || fill.equals("emailAddress")) t |= InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS;
            else if (type.equals("url")) t |= InputType.TYPE_TEXT_VARIATION_URI;
            else if (fill.equals("name") || fill.equals("username")) t |= InputType.TYPE_TEXT_VARIATION_PERSON_NAME;
            if (cap.equals("characters")) t |= InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS;
            else if (cap.equals("words")) t |= InputType.TYPE_TEXT_FLAG_CAP_WORDS;
            else if (!cap.equals("none")) t |= InputType.TYPE_TEXT_FLAG_CAP_SENTENCES;
            if (has("autocorrect=1") && !secure) t |= InputType.TYPE_TEXT_FLAG_AUTO_CORRECT;
            else t |= InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS;
            if (has("multiline=1")) t |= InputType.TYPE_TEXT_FLAG_MULTI_LINE;
        }
        out.inputType = t;
        int action = ret.equals("go") ? EditorInfo.IME_ACTION_GO : ret.equals("next") ? EditorInfo.IME_ACTION_NEXT : ret.equals("search") ? EditorInfo.IME_ACTION_SEARCH :
                     ret.equals("send") ? EditorInfo.IME_ACTION_SEND : ret.equals("done") ? EditorInfo.IME_ACTION_DONE : EditorInfo.IME_ACTION_UNSPECIFIED;
        out.imeOptions = action | EditorInfo.IME_FLAG_NO_EXTRACT_UI | EditorInfo.IME_FLAG_NO_FULLSCREEN;
        if (!fill.isEmpty() && android.os.Build.VERSION.SDK_INT >= 26) setAutofillHints(fill);
        out.initialSelStart = Selection.getSelectionStart(mirror.getEditable());
        out.initialSelEnd = Selection.getSelectionEnd(mirror.getEditable());
        return mirror;
    }

    /** The IME's view of the field: BaseInputConnection over an Editable that holds the engine's text; every call is applied here (so the IME
     *  reads back what it wrote) and sent to the engine, which answers with the field's new state (sync). */
    static class Mirror extends BaseInputConnection {
        final ZincEdit view;
        final Editable text = Editable.Factory.getInstance().newEditable("");
        boolean applying;

        Mirror(ZincEdit v) { super(v, true); view = v; }

        @Override public Editable getEditable() { return text; }

        void set(String value, int caret, int anchor, int compA, int compB) {
            applying = true;
            if (!text.toString().equals(value)) text.replace(0, text.length(), value);
            int len = text.length();
            Selection.setSelection(text, Math.max(0, Math.min(len, anchor)), Math.max(0, Math.min(len, caret)));
            if (compA >= 0 && compB <= len) setComposingRegion(compA, compB); else removeComposingSpans(text);
            applying = false;
            InputMethodManager imm = (InputMethodManager) view.getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
            imm.updateSelection(view, Math.min(caret, anchor), Math.max(caret, anchor), getComposingSpanStart(text), getComposingSpanEnd(text));
        }

        static void signal(String line) { dev.zinc.app.ZincActivity.nativeSignal(line); }

        @Override public boolean commitText(CharSequence t, int cursor) { super.commitText(t, cursor); signal("commit " + t); return true; }
        @Override public boolean setComposingText(CharSequence t, int cursor) { super.setComposingText(t, cursor); signal("compose " + t); return true; }
        @Override public boolean setComposingRegion(int a, int b) {
            super.setComposingRegion(a, b);
            if (!applying) signal("imeselect " + a + " " + b);   // ponytail: a region the IME marks on committed text is taken as a selection
            return true;
        }
        @Override public boolean finishComposingText() {
            int a = getComposingSpanStart(text), b = getComposingSpanEnd(text);
            String run = a >= 0 && b > a ? text.subSequence(a, b).toString() : null;
            super.finishComposingText();
            if (run != null && !applying) signal("commit " + run);   // the run stays as it is: committed
            return true;
        }
        @Override public boolean deleteSurroundingText(int before, int after) { super.deleteSurroundingText(before, after); signal("imedelete " + before + " " + after); return true; }
        @Override public boolean setSelection(int a, int b) { super.setSelection(a, b); if (!applying) signal("imeselect " + a + " " + b); return true; }
        @Override public boolean performEditorAction(int action) { signal("imeaction " + action); return true; }
        @Override public boolean sendKeyEvent(KeyEvent e) { return SDLActivity.handleKeyEvent(view, e.getKeyCode(), e, this); }   // hardware-like keys (Delete, arrows) go SDL's way
    }
}
