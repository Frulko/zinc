# E-ink monitors and mirroring tools: what makes them fluid and precise (research, 2026-10-28)

Goal: improve the Mac to reMarkable Paper Pro sidecar (luma, tone curve, Bayer 8x8 to 1 bit, 32x16 tile diffs, clean pass after 1 s idle). Problems: thin light-grey lines vanish, fast-waveform ghosting, cursor trails.

Method note: web search plus page fetches. Vendors publish almost nothing about internals; what is a source fact is marked (S), what is our inference is marked (I). Dasung and Boox Mira are closed; no source documents their cursor handling or edge enhancement.

## Findings

### Modos Glider / Caster (the only open design)
Source: [Glider README](https://github.com/Modos-Labs/Glider), [Caster](https://github.com/Modos-Labs/Caster), [Crowd Supply deep dive](https://www.crowdsupply.com/modos-tech/modos-paper-monitor/updates/a-technical-deep-dive-into-glider).
- (S) Every pixel is its own update region: a new input does not wait for the global ~100 ms update cycle (a global counter caps at ~10 Hz). If a pixel changes mid-update it is driven toward the new state and its frame counter is adjusted ("early cancellation"). Result: 75 Hz, under 100 ms latency.
- (S) Hybrid automatic mode, per pixel: a changed pixel uses the fast binary (or 4-level) mode; a pixel unchanged "for a while" is re-rendered in 16-level grey (GL16/GLR16 family, the non-binary clean). So the "clean" is per pixel, not a global flash.
- (S) Host software can assign a mode per window/region and force an update or clear on a per-pixel basis.
- (S) Hardware dithering offered: Bayer, blue noise and error diffusion, zero added latency; gamma-aware dithering in linear space is noted as noticeably better at 1 bit. Error diffusion costs throughput (133 MP/s vs over 200 MP/s without).
- (S) GC16 is a flashing mode; DU4 is the only non-flashing greyscale mode. The activation phase (alternating VPOS/VNEG pulses at the start of a waveform) improves contrast.
- (S) The deep dive says the FPGA allows "special compensation" for the mouse cursor in desktop use; no method given. Hacker News commenters still report visible ghosting.

### Boox Mira / Mira Pro
Source: [review](https://myereader.substack.com/p/onyx-boox-mira-review-features-neededhtml), [miractl](https://github.com/clarkema/miractl).
- (S) Four presets: Speed (cursor, scrolling), Video (stronger light filter), Text (pure B/W, no grey), Image (best detail, cursor "very slow"). Custom = three knobs: refresh speed 1-7, "dark color enhancement" = contrast 0-15, "light color filter" = white clip.
- (S) miractl exposes the filters as WHITE:BLACK, each 0-127 (example 10:96). The white filter pushes near-white backgrounds to pure white "to avoid distracting dithering"; the black filter pushes near-black text to pure black at the cost of dark detail. That is exactly our levels stage, and the vendor treats it as a user-visible knob.
- (S) Ghosting is "heavy in every mode"; higher refresh speed means faster cursor but more ghosting. Full refresh by button, shortcut or a timer (example 5 min). The reviewer's wish: automatic full refresh after a drag ends, A2 only while scrolling.

### Dasung Paperlike
Source: [PC Watch](https://pc.watch.impress.co.jp/docs/column/hothot/1140704.html), [Good e-Reader](https://goodereader.com/blog/?p=385743), [CNX](https://www.cnx-software.com/2025/04/30/new-color-e-paper-monitors-13-3-inch-dasung-paperlike-13k-and-23-5-inch-boox-mira-pro-color/).
- (S) Hardware "C" (clear) button removes afterimages; "Auto-Clear" is advertised as removing partial ghosting automatically; several speed levels ("Fast++++" smoothest cursor, more ghosting) and content modes; contrast buttons. 13K: 37 Hz, 103: 60 Hz; "a higher refresh rate always costs image quality".
- No source found for text/edge enhancement or cursor treatment.

### reMarkable mirroring projects
Source: [goMarkableStream](https://github.com/owulveryck/goMarkableStream), [rmview](https://git.protagon.space/hiro/rmview/src/tag/v2.0), [reStream](https://github.com/rien/reStream).
- These stream tablet to PC (the opposite direction). Useful only for transport: goMarkableStream sends delta runs (typically 1-5% of pixels), gzip full frames when over 30% changed (`RK_DELTA_THRESHOLD` 0.30), ~10% CPU at one frame per 200 ms. Paper Pro support is experimental. Nothing about driving the e-ink waveform. We found no reMarkable or Kindle VNC viewer that documents a ghost-clean policy (Kindle practice: full flash every N pages, "6 pages and a full flash" on Kindle 4, per [MobileRead](https://www.mobileread.com/forums/showthread.php?p=2826651)).

### Waveform and dithering background
Source: [NXP dithering note](https://community.nxp.com/docs/DOC-93396), [E Ink patent US11380273](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11380273), [DC balance, US11935495](https://patents.google.com/patent/US11935495).
- (S) DU and A2 are 1-bit fast modes; A2 is the fastest (125 ms vs 600 ms GC16 on 800x600, old panel) and ghosts most. Dithering is what makes them usable for animation/video. The controller cannot detect ghosting; a flashing GC16 is the standard cure. Waveforms are DC-balanced; many unbalanced fast updates in a row cause remnant voltage and drift (I: clean periodically, not only on idle).
- (S) Ordered dither is position-independent (stable between frames, so unchanged areas produce no diffs); error diffusion has serpentine scanning and propagates one changed pixel across a row/page, which breaks tile diffs on moving content. Sierra Lite is the cheapest diffusion variant.
- Not found anywhere: unsharp mask / thin-line preservation specifics for e-ink. The following is our inference.

## Inferences for our problems
- Vanishing thin grey lines: a 1 px line at luma ~180-220 is below every Bayer threshold row, so it dithers to white. Bayer 8x8 also needs about 64 levels of area to show a grey. Fix before dithering, not in the dither: edge-aware pre-pass (dark-line min filter / local contrast boost), or per pixel force black where a pixel is darker than its neighbours' mean by more than a margin.
- Trails: fast waveform leaves residue where a pixel goes white-to-black-to-white quickly. Caster's answer is per-pixel timing, which we cannot do; our unit is a 32x16 tile.
- Cursor: no vendor documents it; Glider only says it compensates. Our cursor is a small moving object over static content, the worst case for DU/A2.

## Ranked techniques to adopt
1. **Per-tile "rested" clean (Caster hybrid mode).** Track last-change time per tile; after ~300-500 ms without change re-render only that tile in the grey/GL16-like mode (Caster does it per pixel after "a while"); keep the global 1 s full clean as a fallback only. Already partly done ("clean only rested tiles"); lower the delay for tiles touched by the cursor.
2. **Pre-dither line protection.** Run a 3x3 local-minimum or unsharp mask (radius 1, amount ~1-1.5) on luma before the tone curve so 1 px grey lines reach luma under the dither threshold; or exempt pixels that are local minima from dithering (threshold at ~0.7 instead of the matrix value). Test on window borders at luma 160-230.
3. **White and black clip as user knobs (Mira: WHITE:BLACK 0-127 each).** Our levels stage should clip near-white (about top 8%) to pure white so dithering noise does not appear on backgrounds, and near-black (about bottom 15%) to black for text. Expose both in the UI.
4. **Keep dithering position-fixed (ordered), prefer blue noise over Bayer for moving content.** Both are stable between frames so tile diffs stay clean (Caster ships both; blue noise has no visible grid pattern). Do not use error diffusion on the live path; use it (serpentine Sierra Lite or Floyd-Steinberg) only for the one-shot clean render of static areas. Dither in linear light (gamma-aware), as Modos notes.
5. **Cursor as an overlay, not content.** Hide the system cursor in the capture (ScreenCaptureKit `showsCursor = false`) and draw our own small black/white cursor in the packet, updating only its two old/new 32x16 tiles; after movement stops (~150-250 ms) clean those two tiles with the grey mode. No vendor documents better; Glider just says "special compensation".
6. **Mode by activity, per region (Boox/Dasung modes, Glider per-window modes).** Hot tiles (changed within last ~200 ms) use UFAST; scrolling/video regions only fast; text regions that settle go to CONTENT. Avoid UFAST for tiles that will not move again.
7. **Clean trigger on motion end, not only 1 s idle (the Mira reviewer's request, Dasung Auto-Clear).** Fire a regional clean when a drag/scroll stops (~250 ms), a global one on idle 1 s, and a count-based safety: after N fast updates on a tile (suggest 20-30, to tune on device) or when more than ~30% of tiles were fast-updated since the last clean, schedule a full clean. Kindle practice is a flash every ~6 page turns; there is no published number for monitors.
8. **Early cancellation / newest-wins queue (Caster).** If a tile is updated again before the previous panel update finishes, send only the newest content and do not queue stale frames; coalesce tile diffs per refresh tick. Keep the delta transport (goMarkableStream: send deltas, full frame above 30% change).
9. **DC-balance hygiene.** Alternate a short dark flash (black then grey, as we do) so no tile receives a long run of unbalanced fast updates; the clean pass already helps, make it mandatory per tile after the count in 7.
10. **Offer a manual clear + a "speed vs clarity" slider** (Dasung C button, Mira refresh speed 1-7): one hotkey for full clean, one setting that scales the thresholds above.

## Open questions (no public data found)
Exact Dasung/Mira cursor handling; any edge-enhancement numbers; Caster's per-pixel idle delay (the Glider README says only "unchanged for a while"; check `rtl/` in Caster for the constant).
