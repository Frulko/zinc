# Canvas WPT seed

Five unchanged HTML files and `html/canvas/resources/canvas-tests.js` from
[web-platform-tests](https://github.com/web-platform-tests/wpt/tree/0e3495aa72373a19ef8ba9ba2b28fdb52ff6ffb5),
revision `0e3495aa72373a19ef8ba9ba2b28fdb52ff6ffb5`. `manifest.json` records the
revision, immutable order/denominator and SHA256 of every upstream file, including
`LICENSE.md` (BSD-3-Clause). No patch or build dependency.

The five cases were selected before execution: scale, translate, save/restore
of fillStyle, default fillStyle, and createImageData. They span four Canvas
areas and form a small seed, not broad Canvas coverage or a full-WPT percentage.
No conformance result is recorded yet.

`tools/canvas-wpt --self-test` verifies the corpus, parser, exact inline-source
retention and harness with **synthetic callbacks and fake pixels** in Node. It
does not run the five cases or test a Canvas implementation.

When the owner selects the conformance run:

```sh
/absolute/main/tools/work-run 60 tools/canvas-wpt --zinc /absolute/clean/build/zinc
```

The runner uses one headless QuickJS process at a time, at most 10 seconds per
case, 64 KiB captured output per case and no downloads. Logs, exact generated
scripts and `summary.json` remain under a new `.logs/canvas-wpt/<timestamp>/`
directory. It exits successfully at four or five passing cases (the task's 80%
threshold); all five cases always appear in the denominator and individual
failures remain visible. A process error, missing/duplicate result, unfinished
test or unsupported API fails that case. A corrupt corpus fails before launch.

The adapter implements only the synchronous `_addTest` load lifecycle required
by these pages. Upstream callback bodies and numeric assertions are unchanged;
the unmodified canvas helper calls strict adapter assertions. Expected images,
CSS and the HTML report are visual diagnostics and are not used as assertions.
This is not the upstream testharness implementation: asynchronous/resource and
other cases require actual upstream harness support before adding them. No
Canvas method is replaced or implemented by the adapter. Node is required only
for the pure self-check, not the real Zinc run.

Actual execution, other JS engines, p5/Phaser SSIM and FPS remain unproven and
are separate owner-selected runs. `tools/test-lib` already pins p5 2.3.4.
