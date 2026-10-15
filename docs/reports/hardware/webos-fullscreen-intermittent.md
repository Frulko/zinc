# HP TouchPad (webOS 3.0.0 build 41): why the 14 px strip over a full-screen PDK card comes and goes

Status: research, 2026-10-15 (afternoon). Follows `webos-fullscreen.md`; nothing listed there is proposed again.
Sources:
- the openwebos/luna-sysmgr source (2013 head, derived from 3.0.5);
- **the device's own `/usr/bin/LunaSysMgr`** (3.0.0, BUILDNUMBER=41, BUILDTIME=20110609, not stripped), disassembled with `llvm-objdump`;
- the device's `libnapp.so`;
- `/var/log/messages` (read-only over novacom);
- a LunaSysMgr screenshot (`/tmp/m.png`, 12:55 local) that shows the strip.

Nothing on the tablet was written, killed or launched.

## Summary

- **What the strip is (high confidence).** LunaSysMgr maximizes a card at a vertical offset of `r.y()/2`. `r` is the card's
  maximized bounds. While the status bar is shown, `r.y() = 28`, which puts the card **14 px low** (28/2 = 14). The PDK picture
  is not moved. The strip is LunaSysMgr's own layer above the card item, black or stale. The rows 0..13 of the program are hidden,
  and its last rows still show. The full screen is granted, but the card was centred on the space below a status bar that is no
  longer there.
- **What decides it (high confidence).** Every launch maximizes the card **twice**:
  1. The first maximize runs when the client's `AddWindow` arrives. The status bar is still shown, so it uses offset 14.
  2. A second maximize is meant to follow. It comes from `hideStatusBarAndNotificationArea()` through
     `MaximizeState::positiveSpaceAboutToChange` and uses offset 0.

  There is a strip whenever step 2 is skipped or loses to step 1.
- **Why it is intermittent (medium confidence, ranked below).** Step 2 depends on state held in `SystemUiController` and on
  timing. The best fit for "absent for a while, back after the restarts":
  - `m_statusBarAndNotificationShown` can stay `false` across launches. One cause is a full-screen card that closes while the
    screen is locked, because `removeWindowProperties()` is skipped while locked.
  - While that state holds, the **first** maximize already computes offset 0, and every later launch is clean.
  - A reboot resets the flag to `true`, and the race (and the strip) comes back.
- **Why re-sending `fullScreen:true` after the card is maximized did nothing (confirmed by the code).**
  `hideStatusBarAndNotificationArea()` returns at once when the bar is already marked hidden, so nothing re-centres the card. A
  client has to send `fullScreen:false` first and **then** `true`.

## 1. The mechanism, claim by claim

Lines are in openwebos/luna-sysmgr unless marked "3.0.0", which means the device binary at the given address.

| # | Claim | Where |
|---|---|---|
| 1 | The maximize offset is `r.y()/2`: `maximizeActiveCard(r.y()/2)` (animated) or `maximizeActiveCardNoAnimation(r.y()/2)` | `Src/lunaui/cards/CardWindowManager.cpp:1100-1113`; 3.0.0 `CardWindowManager::maximizeActiveWindow` 0x14d6f0-0x14d76c (the same `y + (y>>31) >> 1` computation) |
| 2 | The offset moves the card's centre: `p.trans.setY(-card->y() + centerOffset)` | `Src/lunaui/cards/CardGroup.cpp:338, 382` |
| 3 | For a `fullScreen` card, `r = (m_targetPositiveSpace.x, m_targetPositiveSpace.y, uiWidth, uiHeight)`; otherwise `m_normalScreenBounds = (0, 28, W, H-28)`. Either way `r.y()` is 28 while the status bar is shown | `CardWindowManager.cpp:2823-2830, 276`; 3.0.0 `normalOrScreenBounds` 0x145bec (reads +0x40/+0x44 = target x/y) |
| 4 | `m_targetPositiveSpace` changes only when `signalPositiveSpaceAboutToChange` fires | `CardWindowManager.cpp:2745-2753` |
| 5 | The first maximize at launch is `PreparingState::windowAdded` → `maximizeActiveWindow(animate)`, on the client's `ViewHost_AddWindow`, before the card is the "maximized card", so the status bar is still shown (target y = 28 → offset 14) | `CardWindowManagerStates.cpp:634-647`, `CardWindowManager.cpp:639-651` |
| 6 | `MaximizeState::onEntry` → `setMaximizedCardWindow(card)` → `applyWindowProperties` → `if (card->fullScreen()) hideStatusBarAndNotificationArea()` | `CardWindowManagerStates.cpp:495-515`, `SystemUiController.cpp:1008-1026, 1835-1839`; 3.0.0 0x1610e0, 0xce634-0xce69c |
| 7 | `hideStatusBarAndNotificationArea()` **returns at once if `m_statusBarAndNotificationShown` is already false**. Otherwise it emits AboutToChange with y = 0 and starts the positive-space animation | `SystemUiController.cpp:1610-1643` |
| 8 | The second maximize, `MaximizeState::positiveSpaceAboutToChange`: unless `m_exiting`, it first does a **sync** `resizeEventSync(w,h)` to the client when the space grows, then `if (m_positiveSpace.y() != r.y()) maximizeActiveWindow()`, now with target y = 0 → offset 0 | `CardWindowManagerStates.cpp:256-297`; 3.0.0 0x16046c-0x160530 (same guards; `m_positiveSpace.y` is read again after the sync call) |
| 9 | The sync resize waits up to 5 s for the PDK client's reply (`sendSyncMessage` default `timeoutMs=5000`); libnapp's `NGameCard::onResize` only logs | `luna-sysmgr-ipc/src/ipc/PIpcChannel.h:53`, `CardWindow.cpp:755-786`; libnapp 0x75f0 |
| 10 | Both window-property paths are skipped while the screen is locked: no `removeWindowProperties()` (so no `showStatusBar`) when the maximized card goes away, and no `applyWindowProperties()` for the new card | `SystemUiController.cpp:1012-1026`; 3.0.0 0xce8e8/0xce924 (`ldrb [this,#0x6f]`) |
| 11 | `showStatusBarAndNotificationArea()` can also return without setting `shown = true`, when the last positive-space animation already targets the "shown" rectangle | `SystemUiController.cpp:1677-1678` |
| 12 | The log line `Full screen enabled` is **not** the `fullScreen` window property. It is `CardHostWindow::fullScreenEnabled`, the direct-rendering mode turned on by `setMaximized(true)` after the maximize animation. It proves nothing about the status bar | `CardHostWindow.cpp:301-335`, `CardWindow.cpp:1752-1777`, `CardWindowManagerStates.cpp:366-389` |
| 13 | Touches go to the card relative to the card item (`pos - boundingRect().topLeft()`). With the card 14 px low, a tap on screen row y arrives as y-14 (UNCONFIRMED on the device; test 1 below) | `CardHostWindow.cpp:506-536` |
| 14 | libnapp sends `{ 'fullScreen': true, 'hasPauseUi': true, 'overlayNotificationsPosition': 'bottom', 'subtleLightbar': true, 'alsDisabled': true, 'activeTouchpanel': true, ... }` once, in `NGameCard::createWindow`, as IPC message 0x3008 (routing `MSG_ROUTING_CONTROL`, payload int key + string). The next message sent is 0x3003 (one int, probably `AddWindow`). The other NApp calls send only their own key (`suppressGestures`, `blockScreenTimeout`, `hasPauseUi`, `suppressBannerMessages`, `enableCompass`, `fastAccelerometer`) | libnapp strings at 0x14608..; `NGameCard::createWindow` 0x8e00-0x8f00 |

Two observations agree with this model:

- **The keyboard band.** `webos.cpp` already notes that with the keyboard up "the card shrinks around the screen's centre (the
  wallpaper shows in a band of k/2 at the user's top)". It is the same centring rule as claim 1.
- **The screenshot** `/tmp/m.png` (12:55:53). Row 0 is a uniform grey line (81,85,88), rows 1..13 are pure black, and the app
  starts at row 14.

## 2. What the device logs show (4 launches of org.zinc.music today, all with the strip)

```
onPrepareAddWindow ... 1024x768          (PreparingState)
setCardWindowAboutToMaximize             (prepareAddWindowSibling)
setCardWindowMaximized                   (MaximizeState::onEntry)     0.1 to 46 ms later
applyWindowProperties: subtle lightbar / active touchpanel / als      the client's properties were in before onEntry
updateProperties: blocking auto-off      (a later NApp_ScreenTimeoutEnable)
Sending focus Event ... Full screen enabled ... Unblanking fb1     ~260-330 ms later (end of the maximize animation)
```

- **The properties arrived before the maximize.** They come with `AddWindow`, and `applyWindowProperties` printed their side
  effects. So `fullScreen` was known at `onEntry`, and claim 6 ran.
- **What the logs cannot show.** `hideStatusBarAndNotificationArea()` logs nothing. So the logs cannot say whether it returned
  early (claim 7) or whether the second maximize ran.
- **No `ROTATION` lines** appear around these launches.
- **One earlier launch** (10:59:40) replaced a still-maximized full-screen card (org.zinc.video-test).
- **The rotated logs start at 10:59 UTC.** No launch without the strip is in them, so no direct comparison is possible.

## 3. Why it is sometimes there and sometimes not

The 3.0.0 binary has the same logic as the open source on every path checked (claims 1, 3, 6, 8, 10). So the strip needs one
of the following.

**A. Sticky "bar hidden" state makes the strip disappear (most likely explanation of the good sessions).**
- **How it starts.** A full-screen card is minimized, killed or replaced while the screen is locked or the display is off. For
  example, the install tool replaces a program while the tablet sleeps. Claim 10 then skips `removeWindowProperties()`, so the
  status bar stays logically hidden (`shown = false`, target y = 0).
- **Effect on later launches.** Claim 7 makes `hideStatusBar` a no-op, but the **first** maximize already reads target y = 0
  (claim 3). The card lands at offset 0: no strip on every launch.
- **When it ends.** The state lasts until something shows the bar again:
  - a normal (non full-screen) card is maximized;
  - the card view is opened;
  - a dashboard or keyboard change sets `shown = true` (`SystemUiController.cpp:1383`);
  - a reboot (`shown = true` at construction, `SystemUiController.cpp:121`).

  This fits "absent at some point today, back after two restarts". UNCONFIRMED: no log from a good session survives.

**B. The second maximize is lost or skipped in the normal launch path (why the strip is the default after a boot).** Candidates:
1. **The re-target is lost in the animation group (UNCONFIRMED).** The offset-0 maximize replaces the offset-14 animation
   inside the card animation group, which is already running (`setAnimationForWindow`, `CardWindowManager.cpp:363-369`;
   `startAnimations` is a no-op on a running group). In Qt 4.6 a child added to a running `QParallelAnimationGroup` starts on
   the next tick only if the group's current time is still below the child's duration (`qparallelanimationgroup.cpp`
   `shouldAnimationStart`). The group's clock can jump by however long LunaSysMgr was blocked in the sync resize of claim 9:
   `QUnifiedTimer` keeps `lastTick` while other animations run (`qabstractanimation.cpp` 4.6, `updateAnimationsTime`). If the
   PDK process is busy and slow to answer `View_SyncResize`, the new child can be skipped. Startup time varies with load, which
   would make this intermittent. Not proven: the predicted end position (the card's off-screen start position) does not match
   the strip exactly.
2. **The guard `m_positiveSpace.y() != r.y()` is false (claim 8).** This happens when a previous "show" animation had not
   moved `m_positiveSpace` yet, or after claim 11 left `shown` and the space out of step. UNCONFIRMED.
3. **`MaximizeState::m_exiting` stays true.** It is reset only in the non-modal branch of `onExit`
   (`CardWindowManagerStates.cpp:517-543`), so a modal card can leave it true. Unlikely: there are no modal cards here.

**C. Things checked and ruled out.**
- Orientation: no rotation is logged at these launches.
- Dock mode: the `dockStateTransition` lines are the quick-launch dock state machine (`OverlayWindowManager.cpp:251, 336-390`),
  not Touchstone dock mode.
- luna.conf: not touched.

## 4. Web search

- **No public report found** of a 14 px (or any) top strip over full-screen PDK apps on the TouchPad. The searches covered
  webOS Nation, webOS archive pages, the PDK and SDL forums, and general web.
- **No PDK fix in the 3.0.2 notes.** They mention rotation and other bug fixes, but no PDK full-screen fix
  ([phonearena](https://www.phonearena.com/news/HP-TouchPad-may-get-webOS-3.0.2-update-this-week-new-apps-performance-tweaks-en-route_id20432),
  [silicon.co.uk](https://silicon.co.uk/workspace/hp-tweaks-touchpad-bugs-security-and-more-35902)).
- **3.0.0 vs later builds.** This tablet runs **3.0.0 build 41** (June 2011). Most TouchPads shipped 3.0.2 and later got 3.0.5.
  Whether later LunaSysMgr builds behave differently is UNCONFIRMED. The openwebos source matches 3.0.0 on every path checked
  here.
- **No other webOS-specific lead.** The other results (the SDL discourse threads on iOS and Android status bars, a ScummVM
  webOS thread) contain nothing specific to this problem.

## 5. Sources

- https://github.com/openwebos/luna-sysmgr (commit 1393f0a):
  - `Src/lunaui/cards/CardWindowManager.cpp`, `CardWindowManagerStates.cpp`, `CardGroup.cpp`, `CardWindow.cpp`, `CardHostWindow.cpp`
  - `Src/base/SystemUiController.cpp`, `Src/base/WindowServer.cpp:1319-1337`, `Src/remote/IpcClientHost.cpp:217-324`
  - `Src/base/AppDirectRenderingArbitrator.cpp`, `Src/lunaui/launcher/OverlayWindowManager.cpp:251`
- https://github.com/openwebos/luna-sysmgr-ipc `src/ipc/PIpcChannel.{h,cpp}` (sync messages, 5 s default timeout, nested loop)
- https://github.com/openwebos/luna-sysmgr-ipc-messages `include/public/messages/SysMgrMessagesInternal.h`
- Qt 4.6: https://raw.githubusercontent.com/qt/qt/4.6/src/corelib/animation/qparallelanimationgroup.cpp, `qabstractanimation.cpp`
- Device (read-only, 2026-10-15):
  - `/usr/bin/LunaSysMgr` (3.0.0 b41) at the addresses above;
  - `/usr/lib/libnapp.so` (`NGameCard::createWindow`, `onResize`);
  - `/var/log/messages*`;
  - `/tmp/m.png`.

## 6. Client-side experiments, ranked (one line each)

1. **Prove the mechanism.** With `ZINC_WEBOS_TOP=0`, tap a marker drawn on screen row 100 and log the raw `SDL_MOUSEBUTTONDOWN` y in `webos.cpp`. y = 86 means the card item is 14 px low (claims 1, 13).
2. **Toggle full screen.** Re-send the window property as `false`, wait about 1 s, then send `true`, 1-2 s after `SDL_SetVideoMode`, on libnapp's own channel:
   - in the zinc executable (exported, `-rdynamic`), define `PIpcChannel::sendAsyncMessage(PIpcMessage*)`;
   - in it, record `this` and the int key of the first type-0x3008 message, then forward the call through `dlsym(RTLD_NEXT, ...)`;
   - later build a `PIpcMessage(0x7fffffff, 0x3008, prio)` with `writeBytes(&key,4)` and `writeString("{ 'fullScreen': false }")`, then the same with `true`.

   Prediction: `false` shows the bar, and `true` hides it again and re-centres the card at offset 0, outside any running card animation.
3. **Test the sticky-state cure (no code).** With a full-screen Zinc card in front, lock the tablet (power key), replace or kill the program with the install tool while locked, unlock, launch again. Prediction (A): no strip on this and every later launch until a normal app or a reboot.
4. **Answer Luna's sync resize quickly.** Right after `SDL_SetVideoMode`, pump `SDL_PollEvent` for about 500 ms before the program's heavy initialization, so `View_SyncResize` (claim 9) is answered at once. Prediction under B1: the strip stops depending on startup load.
5. **Detect the strip at run time.** Keep `ZINC_WEBOS_TOP` but set it only when needed: after the first focus event, read where the first tap lands (experiment 1's offset) and set `top` to 0 or 14 from it, instead of assuming 14.
6. **Avoid a no-op.** Do not re-send only `fullScreen:true`. It is a proven no-op (claim 7), which explains the earlier "re-sending changed nothing".
