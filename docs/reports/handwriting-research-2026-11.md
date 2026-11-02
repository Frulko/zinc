# Handwriting and hand-drawn symbol recognition on the device (research, 2026-11-02)

Question (owner): for the `examples/ink-lab` demo, what do the state of the art and GitHub offer for recognising pen strokes on the device,
what could run in our int8 C kernels (`plugins/ink/native/ink.abi.cpp`), and what accuracy gain over the current stack is realistic?
Addendum (owner): recognition must be precise and responsive; prefer the most accurate method that stays fast on the tablet's Cortex-A53.

Method: web search (standard mode; the extended mode was not used, the first rounds were enough to rank the options). Claims taken from a
search result carry its URL; claims marked *(memory)* are from the author's background knowledge and were not re-verified in this session.
Nothing was downloaded or vendored.

## Where we are

`zinc:ink` (`docs/plugins/ink.md`): stage A is a `$Q`/`$P`-family point-cloud matcher over a few hundred templates; stage B is a 49 KB int8 CNN
(24x24 raster, three planes, 3 conv + 2 dense, about 1.4 M multiply-adds, 0.4 ms a mark on an M1) over 11 classes
(`A B C D E V`, `circle x tick line`, `scribble`). Both train on synthetic strokes (pen skeletons bent by a made-up hand). Documented accuracy on the held-out
synthetic writers: matcher 99.7 %, net 100 %; on harder bends 95.4 % and 99.4 %. **No number exists for a real hand**; that is the largest unknown, not
the model size.

## What the field offers

| Candidate | What it is | Licence / availability | Fits our int8 kernels? | Verdict |
|---|---|---|---|---|
| `$Q`, `$P`, `$P+` (Vatavu, Anthony, Wobbrock) | Point-cloud template matchers; `$Q` is 142x faster than `$P` on a 600 MHz CPU and 191 ms on a Cortex-A7 for its benchmark gesture set, same accuracy ([UW project page](https://depts.washington.edu/acelab/proj/dollar/qdollar.html), [MobileHCI 2018 summary](https://init.cise.ufl.edu/publications/articulation-invariant-stroke-gesture-recognizer-for-low-resource-devices)). `$P+` targets low-vision articulation ([page](https://depts.washington.edu/acelab/proj/dollar/pdollarplus.html)) | Published algorithms, BSD-style reference code | It is what we run | Keep as stage A and as the rejection signal; it is what makes user-taught symbols possible without retraining |
| Zinnia / Tegaki (SVM on stroke features) | Small online recogniser, Japanese/Chinese models ([Debian package listing](https://packages.debian.org/nl/sid/x32/tegaki-zinnia-japanese)) | BSD engine; model data licences vary by package *(memory)* | No (SVM, C++ already) | Not an accuracy gain over a CNN on isolated Latin letters; skip |
| Google ML Kit Digital Ink Recognition | On-device LSTM recogniser, about 20 MB per language, about 100 ms a line on a phone ([Google blog](https://developers.googleblog.com/en/digital-ink-recognition-in-ml-kit), [docs](https://developers.google.com/ml-kit/vision/digital-ink-recognition/android)) | Proprietary SDK, model downloaded at runtime | No | Excluded: licence and runtime download. Useful only as the size/latency reference for text lines |
| Fast multi-language LSTM online recogniser (Google, [arXiv 1902.10525](https://arxiv.org/pdf/1902.10525)) | CTC over stroke sequences, text lines, many scripts | Paper only; no weights | LSTM+CTC needs float or int16 recurrent kernels we do not have | The route to words and lines, not to isolated marks; a later project |
| Small CRNN/CTC image models (e.g. [DE-HTR](https://huggingface.co/naeyn/de-htr-web), 9.8 MB int8 ONNX; [CRNN-CTC English](https://github.com/huyhoang17/CRNN_CTC_English_Handwriting_Recognition), archived) | Offline line images, not pen strokes | Per repo; mostly research | Too big and image-only | Not applicable: we have the strokes, which carry more than the picture |
| Quick, Draw! dataset | 50 M doodles of 345 categories as strokes | CC BY 4.0, attribution ([licence mirrors](https://github.com/shiffman/quickdraw-dataset), [TFDS/HF metadata](https://www.tensorflow.org/datasets/community_catalog/huggingface/quickdraw)) | Yes as training data for a shape net | Doodles, not letters; reported 86 to 88 % top-1 over 345 classes for ResNet50, Transformer and Sketch-BERT ([InkFM](https://arxiv.org/pdf/2503.23081)): a hard open set, not our problem. Useful later for a "shapes" class set (circle, arrow, star...) |
| sketch-rnn (Ha and Eck) | Generative stroke RNN over Quick Draw | Apache-2.0 code *(memory)* | No (RNN, float) | Not for recognition |
| UJI Pen Characters v2 | 11 k isolated online characters (letters, digits, lowercase) from 60 writers, with strokes ([UCI page](https://archive.ics.uci.edu/dataset/177)) | **CC BY 4.0** (same page) | Yes: same input as ours | **The best real-hand data available to us**: real writers, our exact input shape, vendorable with attribution |
| Pen-Based Recognition of Handwritten Digits (UCI pendigits) | 10 992 online digits, 44 writers, 8 resampled points | CC BY 4.0 *(memory, check the UCI page before vendoring)* | Yes | Real digits for a digit class |
| EMNIST (letters 94.1 %, balanced about 90 % with 0.4 M parameter CNNs, [paper](https://arxiv.org/pdf/1702.05373)) | Offline images of NIST forms | NIST data, public domain *(memory)* | The net is an image net at heart | Images of scanned paper differ from a raster of strokes (no stroke order or pen-up); use only as a sanity ceiling, not as training data |
| CROHME | Online math symbols and expressions ([ICFHR 2016 report](https://digitalcommons.isical.ac.in/conf-articles/726)) | Competition data under a research licence *(memory, not vendorable until read)* | Symbols yes | Excluded until the licence is read |
| IAM-OnDB | Online English text lines | Registration and research-only licence *(memory)* | no | Excluded |

## What would run in our kernels, and what it buys

The kernels are int8 convolution, ReLU, 2x2 max pool and dense with per-channel multipliers, with the integer reference in `tools/ink-train/inknet.py` and
the bit-exact test `tests/t0/ink_net.sh`. Everything below stays inside that vocabulary, with no new operator.

1. **Real data, not a bigger net (largest expected gain).** On synthetic writers the matcher is at 99.7 % and the net at 100 %: the ceiling is reached, so
   a bigger architecture cannot be measured to help. The open error is the hand gap. Adding UJI (letters, digits, lowercase; CC BY 4.0) and the notes app's
   record mode files as held-out real writers turns the benchmark into a meaningful one. Realistic expectation for a mixed synthetic+real training set
   with a few dozen real writers: 90 to 96 % top-1 on unseen real writers over the 11 classes, against an unknown (probably 80 to 90 %) today. This is an
   estimate, not a measurement.
2. **More classes: digits and lowercase.** The output layer grows from 11 to about 21 (digits) or 47 (digits, lowercase, upper-case): a dense layer of 128x47
   is 6 k weights, nothing. The cost is confusable pairs (0 with `circle` or O, 1 with `line` or l, 5 with S, 2 with Z, V with v, C with c, x with X): they
   need the real data of item 1 and a small context rule (size relative to the line), not more capacity. `plugins/ink/templates.ts` and the net regenerate
   with `make-dataset`, `make-templates` and `train`; four test goldens change. Not done here: it is a model release with real data, not a quick win.
3. **Resolution 24 to 32.** 1.8x the pixels, 3x the multiply-adds in the first layers (about 2.5 to 4 M in total): fine detail (B against 8, 5 against S)
   gets more room. Cost on a Cortex-A53 (in-order, NEON, no dot-product instructions): our kernels are plain C; a reasonable guess is 100 to 300 M int8
   multiply-adds per second compiled by clang, so 1.4 M is 5 to 14 ms and 4 M is 13 to 40 ms; the 0.4 ms on an M1 is not transferable. **To be measured on
   the tablet** (`docs/reports/zinc-next-perf.md` has no A53 number for the net). Expected gain: 1 to 2 points on real hands, the least certain item.
4. **Test-time augmentation and a two-stage vote.** Running the net on the mark plus two slightly sheared copies and averaging the logits costs 3x the compute for
   a typical 1 to 2 point gain on noisy input *(memory of common practice, not measured here)*. Only worth it when the first two items are done and the A53 budget allows.
5. **Writer adaptation through stage A.** The matcher takes user templates (`loadModel`). A "teach this letter" step that records three examples per class per
   person is the cheapest, most certain accuracy gain for a hand the model never saw, and needs no training run.
6. **Words and lines** (LSTM/CTC as in the Google paper) are out of reach for the current kernels and are not needed for the demo.

## Responsiveness (owner addendum)

- The recogniser is not the bottleneck: marks cost 0.4 ms on an M1 and an estimated 5 to 15 ms on an A53 (to be measured); `recogniseAsync` keeps the UI thread free.
- The wait the person feels is the settle delay of `StrokeGrouper` (default 450 ms). `examples/ink-lab` shows a guess right at pen-up (the open mark is
  recognised at once), a partial guess every 120 ms while the pen is down, and keeps the mark open for 250 ms before it settles into the list. A later
  stroke inside a mark still changes the guess (an E drawn in four strokes reads as a better and better E). An e-ink panel adds its own refresh latency
  on top (not part of these numbers).
- Measured in the lab (macOS build, headless, first call includes the worker start): 17 ms from pen-up to the answer on screen, 33 ms for the first match.
  Steady state and the A53 are to be measured; `tests/t1/ink_lab.sh` prints no timings so its golden stays stable.

## Recommendation

1. Keep the `$Q` matcher plus the int8 CNN: it is the right size and speed for the A53, and no published open model beats it at the same footprint on isolated marks.
2. Spend the next effort on **data**: import UJI Pen Characters v2 (CC BY 4.0, attribution in `third_party/README.md`) and pendigits as real held-out and train writers
   through `make-dataset --real`, record a dozen people with the notes app's `NOTES_RECORD`, and re-measure with real held-out writers. That gives the first
   honest accuracy number.
3. Then add digits and lowercase classes (item 2), measure the A53 latency of the 24 and 32 pixel nets, and take the 32 pixel net only if the real-hand
   gain is at least 2 points and a mark stays under 30 ms.
4. Add the "teach a letter" step (item 5) to the lab for a visible gain on the demo without a new model.

## What to try next

- `tools/ink-train/make-dataset --real` over a UJI converter (CC BY 4.0), a held-out split by writer, a table of per-class confusions.
- A bench of the net on the tablet through `tools/zbench` (24 and 32 pixel nets, 5 to 15 ms estimate).
- Digit skeletons (10 classes with 2 to 3 variants each, like the letters in `make-dataset`) as a stopgap before real data.
- A Quick Draw subset (CC BY 4.0) for 8 to 10 shape classes (arrow, star, triangle, square, heart) as a second model file loaded with `loadModel`.
