---
name: zinc-demo
description: Create or improve runnable Zinc demos under examples/, including their UI model, input, resource lifetime, idle behavior and proof. Use alongside zinc-app for demo implementation; does not apply to unrelated websites or generic TypeScript examples.
---

# Build a demo that proves the feature

Use [zinc-app](../zinc-app/SKILL.md) for provider discovery and readable implementation. Read `examples/GUIDELINES.md` and the relevant parts of `examples/music-tree/src/` before implementing a new demo or a substantial rewrite. For a small fix, inspect the existing demo's chosen model and changed paths instead of loading the whole reference app.

Start with what the person will do and what that proves. Preserve the requested product; do not add a showcase menu, settings system, abstraction or unrelated feature to make the demo look complete.

## Use the existing UI and lifecycle

Choose the model according to `examples/GUIDELINES.md`: modern desktop/Pi 4/recent phone UI, `zinc:stage` for the display-tree/old-device case, or LVGL for the specified microcontroller case. Retain the established model of an existing demo unless the task calls for a change. Check constraints before selecting a renderer; do not copy music-tree's tree or invent layout infrastructure.

Apply zinc-app’s responsibility and component rules: one named component per file, feature-local children beside their page, and subfolders when they make ownership clearer. Split a screen that is accumulating unrelated controls or state; do not replace it with an abstract component framework.

Use the demo layout when those responsibilities exist. Keep the entrypoint to composition/input/lifetime, outside systems in services, page behavior with its page, and shared controls in the chosen kit. Do not generate empty folders or manufacture a constants/service/class layer for a one-off expression.

A second demo needing an existing core piece is evidence for promotion, not permission to copy it. Compare the contracts first. Image handles have ownership; a UI cache based on UI-node references cannot be silently reused for stage/video frames. Unit and pixel-rounding differences in duration or image-fit helpers must be resolved before sharing.

## Make activity observable and bounded

Apply the actual performance/input rules from `examples/GUIDELINES.md`: no idle redraws, no rebuilding the tree during measure/draw, no uncontrolled allocation in hot paths, no hidden animations, clipped input regions and no stale async result overwriting newer state. Network retries and logged events follow meaningful changes, not every frame/poll.

Show loading, failure and empty states for outside data the feature depends on. Exercise touch, mouse and keyboard for the targets listed by the demo. A target not validated is reported as unvalidated, never implied by a manifest entry.

## Prove the requested behavior

Run `zinc check`. Use the targeted app/demo/engine test tiers from `TESTING.md` and `examples/GUIDELINES.md`; do not invent a blanket suite. A visual change needs an actual capture and relevant interaction, plus idle/resource checks when touched. Use local fixtures for service failures and deterministic inputs for scripted sessions.

Respect background-window and process-cleanup rules. Fix engine gaps at their source instead of rewriting the demo around them. Preserve provenance for ports and references. Update the manifest, README, affected-test mapping and changelog only as applicable to the actual change.

Before delivering, reread the user path and question whether a simpler complete implementation exists. Apply zinc-app's quality bar to the full diff: no copied provider, unrelated feature, catch-all utility module or claimed proof that was not run.
