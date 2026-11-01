# Murdoku prototype: explainable deduction

Owner-requested original demo, `examples/murdoku`, 2026-10-31. No engine changes or external runtime service.

## Rules and evidence

Six people occupy distinct rows/columns on a furnished six-row map with 6–8 columns and absent cells. Empty cells, seats, rugs and beds are legal; solid furniture is not. Placing someone disables/crosses their row/column. The victim has no testimony and no witness names them in a relation. Exactly one other person shares their room: the murderer. The victim identity and scene vary. Witnesses are listed A–E with matching first names, then V with a V first name. A local seeded catalog contains 48 first names.

The editable `assets/clue-dictionary.json` contains 400 French templates in 40 semantic families, tagged by scope, target, exclusivity, negation and quantifier. Compile it with `tools/compile-phrases.py`; `src/phrases.ts` is generated. Ordinary adjacency, exclusive adjacency, standing on a furnishing and merely being in a room containing one are different predicates. Same-room orthogonal adjacency is explicit. Half-board clues were removed; concrete rows/columns, furniture alignment, windows/corners, relations and counts replace them.

## Two independent acceptance checks

`model.ts` owns the predicates and occupancy rules. `solver.ts` uses MRV search and counts up to two complete assignments. This proves uniqueness.

`deduction.ts` starts from all legal cells and propagates testimony, pairwise compatibility, exclusive rows/columns, a row/column available to only one person, and population bounds. It never branches, imports a search solver or reads the hidden scene. Each narrowing and placement has an explanation. H advances through this recorded walkthrough rather than consulting the answer.

`floorplan.ts` grows four connected room regions from dispersed seeds, randomly claiming adjacent active cells, balancing room sizes. The result has interlocking boundaries, corner cutouts and optional courtyards. `puzzle.ts` furnishes this seeded map, samples a legal scene, randomizes person identities, derives true evidence and removes statements while both checks succeed. Acceptance additionally requires at least two witness placements through crossed constraints, bounded text volume, and useful testimony from every witness: removing all statements belonging to any witness must block the logical solve. Optional globals are retained only if needed by this process. The silent victim is inferred from those constraints and the crime rule.

These are objective reasoning checks, not a claim that human difficulty has been calibrated. Discovery may keep more explicit anchors; every level must be deductively solvable.

## Visuals

Eighteen original illustrated furniture sprites, four floor surfaces and eight room themes. Thirty-two coherent character busts replace the failed realistic layer composition. Their faces, eyes, hair and clothes are painted together; seeded selection varies skin/hair and provides distinct characters. Older component sheets remain generation experiments and are not loaded. Provenance and prompts: `examples/murdoku/assets/README.md`.

Room names are visible on the plan. Wide landscape shows all testimony beside the map; narrow/portrait uses Plan / Witnesses / Help tabs and touch letters. The interface uses compact neutral surfaces and blue actions, keeping warm colors in the map artwork. The active cell is yellow and firm placements show roster checks. H displays short semantic summaries with source/target letter badges and a destination chip. Cell selection + initial makes a firm placement; Shift + initial toggles a note. V always means victim. H explains, Enter checks, Delete clears, Cmd/Ctrl+Z undoes. Firm inputs ignore mouse pencil mode.

## Verification

- Semantic fixtures: true/false adjacency, diagonal/room-boundary rejection, occupancy, exclusivity vs ordinary predicates, room/furniture counts, contradictions and ambiguity.
- All 400 templates format without unresolved placeholders; no half-board templates remain.
- Sixty QuickJS seed/level cases; six interpreter and six explicit native AOT cases. Each checks unique solutions, solution-free deduction, sound recorded placements, useful witness evidence, crossed-constraint placements, victim silence, alphabetic naming/order, sparse furniture and deterministic generation.
- UI/action smoke on interpreter, explicit native AOT and QuickJS, including scripted actual mouse, V, Shift notes and H explanation assertions.
- Rendered frames inspected locally on macOS.

Limits: no human playtest calibration, saved games or multi-cell furniture. Phone and portrait tablet layouts are checked locally at 390×844 and 768×1024; iPhone/reMarkable hardware remains untested. No cross-target testing or performance claim.

## References consulted

- [Official sample by Manuel Garand](https://murdoku.com/pdf/netflix-and-kill-bw.pdf): row/column exclusion, same-area orthogonal adjacency, occupiable furniture, chair exclusivity and victim alone with murderer. No puzzle or artwork is copied.
- [OR-Tools CP-SAT documentation](https://developers.google.com/optimization/cp/cp_solver): domains, constraints and solution enumeration. The existing six-variable typed backtracker avoids a native dependency at this scale.
- [Simon Tatham's puzzle collection](https://www.chiark.greenend.org.uk/~sgtatham/puzzles/index.html): reference for generated logic puzzles and reproducibility. No source is copied.
