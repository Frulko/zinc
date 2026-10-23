# Music Tree on native and compact screens

ZN-783, 2026-10-23. The owner's Pi photo showed a 1024×768 Music Tree surface letterboxed inside an 800×480 framebuffer. Linux now takes the display's native size, with no orientation lock; the desktop still starts at 1024×768.

The existing `zinc:stage` tree remains the layout/input model. `PlayerLayout` updates one reusable geometry object; compact views fit their artwork and transport, stack below 520 px of available content, and scroll when the controls need more height. Navigation becomes a 64 px icon rail. Grids choose their columns from available width. Settings, room/volume sheets, clock/weather/rings and notifications use the same viewport limits and existing scroll containers. A resize invalidates the layout and warm-up image, without requesting frames while idle.

The independent read-only review found three gaps beyond the player: notification header actions overlapped the title, artist/album actions assumed a wide text column, and the empty notification state could overlap the compact status line. These were corrected and added to fixtures. Compact search stacks its best result above tracks; desktop coordinates remain intact.

Proof uses native Mac headless runs, not a cross build: 28 player-layout combinations from 320×480 to 1920×1080, real demo nodes with inert speakers and no desktop credentials, viewport bounds for visible touch zones, Play/scroll/close actions, and one reviewed deterministic 800×480 player golden. Artist, album, search, notifications, pairing and portrait page captures cover content beyond the disconnected states. The fake-house Sonos regression covers idle frames, clipped input and playback handoff.

Physical Pi touch/rotation, actual framebuffer handoff and frame time are not established by these fixtures; they remain in the cross-platform pass. No image or device was changed for this task.
