# Pixel Plays native port and original games

Owner requests (2026-10-31): port the Pixel Plays renderer and its five existing games (Balote, Stari Most, Rooftop Laundry, Tie-Break, Mini Ramp) to strict Zinc TypeScript with native presentation/input. Retain and finish Le dernier bateau. Then create a Canadian-river boat/log-avoidance game with varied logs and four materially different seasons, followed by a cozy Dordogne-bank fishing game with a stone house and pontoon. All three original games need generated native sound effects and coherent ambient sound.

Visual constraint: every animal and object uses the same lit volumetric renderer as the environment. The owner rejected flat outlined cartoon animal sprites and their labels; those were removed and replaced with procedural volumes. Do not reintroduce them.

Implementation in progress: `examples/pixel-plays/src/native/`, `zinc:stage` lifecycle, `zinc:gfx` mutable RGBA image and nearest presentation, native input, `zinc:audio` synthesis and `zinc:storage` best scores. The same typed program must check, interpret, AOT-compile and run with QuickJS, without the web environment. Stage integration must preserve pause, input clipping and resource ownership. The full suite should select games without duplicating the renderer or rebuilding native binaries per scene.

Engine gaps encountered: missing standard Math constants and three-component/variadic Math.hypot. Fixed in shared checker/lowering using one constants table and existing stable binary hypot operation; regression math_geometry checks interpreter/native/QuickJS, edge values, spread and evaluation count. Verification pending engine build.

Original source: amirmushichge/pixel-plays commit 0c2a70f6809478772ac0b3976496a5147e60a43e, MIT; music excluded. The JS adaptation remains temporarily until native parity is proven; it is not the requested final runtime. No performance, parity or hardware claims before checks.
