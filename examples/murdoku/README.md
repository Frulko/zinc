# Minuit au manoir

An original French spatial deduction prototype inspired by the supplied paper Murdoku references. Edition 03 uses the locally archived Murdoku SVG artwork, with source manifests retained. Puzzles and deduction code are generated independently.

```sh
build/zinc run examples/murdoku --engine quickjs --background
```

## Play

Click a cell, then type the person's letter. Witnesses are always listed alphabetically A–E (with matching first names), followed by the victim V and a first name beginning with V. A seeded local catalog supplies 48 names. Shift + letter toggles a pencil candidate without moving anyone; an unmodified letter always makes a firm placement, even if mouse pencil mode is active. Retype the same letter on its square to remove the person, or use Backspace/Delete. X or the **Éliminer · X** button toggles a manual cross on the selected empty square. Manual crosses block placements but remain selectable so they can be restored. They preserve pencil notes, support Undo/Delete, and reset with a new investigation. They do not change automatic row/column exclusions.

With the mouse or a finger, pick a suspect (portrait card or letter in the bottom bar) and tap cells: each tap places them and the brush moves on to the next person still to place. Tapping a cell that already holds the brush person removes them. The pencil button switches the brush to notes. Clicking a cell first and then a portrait still works. No keyboard is needed.

On a pen tablet (the e-ink skin) write on the plan: a letter in a circle places that person, a bare letter is a pencil note, an X crosses the cell out, and a two-finger tap undoes the last move. A mark that is not recognised stays as ink. The recognised mark is replaced by the typeset state of the cell.

Placing a person crosses out their entire row and column. Those cells cannot be selected until the person is removed. Tables, bookcases, plants, pianos, clocks and other solid decor also block placement. Empty cells, armchairs, rugs, beds and hammocks can be occupied. A ◆ marks solid decor. To move someone within their current row or column, remove them first. Undo restores firm placements; pencil notes are toggled manually.

All five testimonies and the silent victim are shown together. Room names appear inside the plan; colors are supplementary. A person can be in a room with others, or alone. Exactly one person shares the victim's room: that is the killer. Once the scene is reconstructed, choose their portrait and accuse them.

H recomputes the next logical step from current placements and manual crosses: testimony, eliminated candidates, row/column consequences, crossed evidence and resulting placements. It never reads the hidden scene to invent a hint. Enter checks the scene; Space toggles mouse pencil mode; Cmd/Ctrl+Z undoes. Keyboard letter repeat is ignored to avoid repeated toggling.

## On paper

`src/ticket.ts` draws an investigation as a till receipt, 576 dots wide (80 mm paper, about 20 cm long): plan, testimonies, and the solution upside down at the end. `authoring/print_ticket.py` captures it and sends ESC/POS to a printer or bridge over raw TCP; it needs Pillow.

```sh
python3 examples/murdoku/authoring/print_ticket.py --seed 7919 --level 1 --host ticket-printer.local
python3 examples/murdoku/authoring/print_ticket.py --preview ticket.png
```

## Generation and constraints

A seeded multi-source growth algorithm builds four connected, interlocking room regions on footprints of 6–8 columns and six rows. Corner cutouts and optional courtyards leave absent cells. Four of eight room themes supply sparse furniture; at least half each room stays free. The scene still contains six people, so wider grids have unused columns. The scene samples a legal row/column permutation and shuffles the people, so no character has a fixed row. The victim is selected from a room with exactly two people.

The victim is silent: no personal clue and no witness names the victim in a relation. Their place is inferred from other testimony, row/column exclusion and the rule of exactly one murderer in their room. Witnesses are ordered A–E without gaps, then V; the victim identity and position on the map vary.

A reviewable dictionary (`assets/clue-dictionary.json`) contains **400 authored templates in 40 semantic families**, tagged by scope, target, exclusivity and negation. Furniture adjacency, being somewhere in a furnished room, and being the only person beside that furniture are separate predicates. No half-board statements are generated. Useful anchors can give an exact row or column; other facts cover furniture rows/columns in the same room, corners, windows, solitude, counts, shared/different rooms and relative person positions. Optional globals count room or furniture occupancy and room coverage.

Generation uses two independent checks. MRV search proves exactly one full scene. A separate **deduction-only solver** starts with legal cells and applies testimony, pairwise support, exclusive rows/columns, a row/column available to only one person, and population bounds. It never branches or reads the hidden solution. A puzzle is accepted only when that process places everyone, including the silent victim. At least two witnesses must be placed through crossed constraints, and each witness's testimony must contribute: removing all their statements must block the logical walkthrough. Every step is recorded for the H key.

Discovery can retain room/coordinate anchors; the other levels start from fewer explicit room facts. Each level uses the same reasoning checks. The labels are still provisional human difficulty grades; solving without guesses is verified, but perceived difficulty is not yet calibrated.

To edit and compile the dictionary:

```sh
python3 examples/murdoku/tools/compile-phrases.py
```

`src/phrases.ts` is generated; the JSON dictionary is the editable source.

## Portraits and decor

Edition 03 uses eighteen object sprites, four floor textures and thirty-two stylized character portraits assembled from the archived official SVG layers. The portrait builder combines body, skin tone, hairstyle, hair color, clothing and clothing color with the source proportion corrections. Characters deliberately use the source's faceless silhouette style. Runtime selection is seeded; composition is baked offline into compact atlases, with every recipe retained in `assets/manor-assets.json`.

```sh
python3 examples/murdoku/authoring/build_assets.py
```

Rebuilding artwork needs `rsvg-convert` and Pillow; playing needs neither. Artwork sources and historical generated experiments: `assets/README.md`.

Furniture names and occupancy match the selected sprites. Walls follow the interlocking room edges. Room boundaries are continuous dark bands; the architecture still records shared door connections, but swinging door sketches are no longer drawn. Coordinates sit outside the cells and room names prefer empty floor runs. Windows are sampled only on actual exterior facades, including cutouts. The renderer and window clues read the same edge masks. At least half each room remains unfurnished.

## Responsive interface

Edition 03 shows witnesses in a two-column desktop sidebar, a larger central plan and a compact vertical tool rail. Portraits and letter badges have stable witness colors; concise testimony summaries retain relation targets as letter badges. Furniture row/column summaries explicitly retain their same-room scope. Scene-wide clues remain visible above the plan.

On small screens, Plan shows the map then the witness cards in one scroll, while a fixed bottom bar keeps touch letters, pencil mode, elimination, undo, hints and validation accessible. The Witnesses tab jumps directly to the roster; Help shows rules, level selection and deductions. The header's ? opens help without spending a hint. Desktop help opens over the plan and can be closed. Validation/placement feedback remains visible beside the board or above the mobile tools. Cells retain yellow focus, placed witnesses show checks, and the safe area applies to the whole shell. Physical iPhone/reMarkable validation remains outstanding.

## Source layout

- `src/puzzle.ts`: scene/evidence generation and acceptance policies.
- `src/floorplan.ts`: connected region growth and absent cells.
- `src/model.ts`: cells, furniture legality and shared constraint predicates.
- `src/solver.ts`: exhaustive solution counting, capped at two.
- `src/deduction.ts`: reasoning without search and recorded explanations.
- `src/phrases.ts`: compiled phrase dictionary.
- `src/clues.ts`: shared clue kinds and records.
- `src/characters.ts`: deterministic coherent portrait selection.
- `src/state.ts`: placements, exclusions, pencil notes, help and undo.
- `src/components/Manor.ts`: retained Stage scene inside a lazy Canvas.
- `src/components/Portrait.tsx`: registered atlas layer composition.
- `src/components/Board.tsx` and `Cell.tsx`: scaled grid, cell controls and room labels.
- `WitnessList.tsx`, `HelpPanel.tsx`, `GameControls.tsx` and `MobileTabs.tsx`: responsive panels and navigation.
- `src/main.tsx`: Solid JSX panels and keyboard routing.

```sh
ZINC=build/zinc tests/run --tier demo --only murdoku
ZINC=build/zinc tests/run --only murdoku_ui
```

The long generator proof checks 60 seeds/levels on QuickJS; interpreter and native AOT each run six representative cases, with the same semantic and dictionary assertions. Checks include legal furniture occupancy, all testimony, unique solutions, room circulation, portrait variation and reproducibility. Action tests cover exclusions, solid furniture, placement, notes, undo, victim keys, help, accusations and regeneration. UI smoke renders each engine. Scripted keyboard/pointer captures are inspected manually.

Prototype limits: no save or sound; responsive layouts are local renderer checks, not physical device validation. Closing loses the investigation. Some source furniture sprites use a frontal rather than strict overhead view. The cast remains six people across four rooms; the 42 reference formats are not all supported. Full React is not used; the panels use `zinc:ui/solid` and the manor uses `zinc:stage` through Canvas.

Reference review and implemented deduction improvements: [RESEARCH.md](RESEARCH.md). Hints now use current placements and manual eliminations; pencil notes remain hypotheses.

Official assets, palettes and 42 reference cases: [local gallery](references/official/index.html) and [collection notes](references/official/README.md). The selected SVGs are now baked into the Edition 03 runtime atlases; the 42 reference cases are not imported as playable content.
