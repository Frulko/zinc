# Unicode emoji picker data

Pinned Unicode 17.0.0 `emoji-test.txt`, dated 2025-08-04, from
https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt .

SHA-256: `1d8a944f88d7952f7ef7c5167fef3c67995bcae24543949710231b03a201acda`.
The unmodified file and generated catalog are covered by the adjacent Unicode License V3.
The license was retrieved from https://www.unicode.org/license.txt ; SHA-256
`e7a93b009565cfce55919a381437ac4db883e9da2126fa28b91d12732bc53d96`.

`tools/gen-picker-emoji` generates `lib/std/kit/picker-emoji.ts`; `--check` checks the checked-in output.
It keeps fully-qualified base emoji in Unicode’s order, excluding Component and toned duplicates.
A tone set is exposed only when all five exact same-tone variants occur in the source. This includes
compound ZWJ sequences without generating invalid combinations. Counts are asserted: 1,914 base
entries, nine groups and 330 complete tone sets. CUI’s picker was the behavior reference;
its generator independently validates the same counts.

The generated table is decoded only when an EmojiPicker uses its default catalog. The UI virtualizes
rows. Glyph availability remains the responsibility of the selected font and target renderer.
