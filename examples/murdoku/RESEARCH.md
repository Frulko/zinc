# Murdoku references — 1 November 2026

The existing engine already separates a complete uniqueness solver from a deduction engine. The useful improvement is to make the latter closer to a human's reasoning and to explain the current game state, rather than just reveal coordinates from the initial solution walkthrough.

## Sources inspected

| Source | Inspected revision | Useful evidence |
| --- | --- | --- |
| [pybi/murdoku](https://github.com/pybi/murdoku) | `ae4da285e0531bff3cdf830d7d999eda6b80e9d7` | `src/engine/logic.ts`, `solver.ts`, `generator.ts`: separate exhaustive search and logical proof; difficulty measured from deduction rules rather than simply clue count. Generation checks uniqueness and whether logic solves the case. |
| [Meldiron/murdoku-studio](https://github.com/Meldiron/murdoku-studio) | `892beef5d370f7907f1cad3970195f3b03359084` | `generator/engine.js`: connected-region growth and constraint propagation. The editor accepts rectangular plans; the generator's documented classic contract is square. Do not apply “every column is occupied” blindly to our wider boards. |
| [DoArtMonteiro/murdoku](https://github.com/DoArtMonteiro/murdoku) | `4c5c5032b5981c8a604242b3bc97fcc13d9ee247` | `src/core/engine.ts`, `generate.ts`, README: seeded cases, separate validation and UI state, progress storage and case catalogue. Good direction for resuming a case, but not needed to fix deduction. |
| [martineberlein/murdoku-solver](https://github.com/martineberlein/murdoku-solver) | `ebd19d677f6dd667a102067fe4074ce8fe70d271` | `src/murdoku_solver/`: board, people and clues expressed as Z3 constraints. Useful independent validation approach; adding a desktop SMT dependency to the iPhone runtime is unnecessary. Example furniture settings are puzzle data, not universal occupancy rules. |
| [hendrikdq-dev/murdoku-solver](https://github.com/hendrikdq-dev/murdoku-solver) | `954e9f5ff04e45db44732822ecf637bf1dfa04b1` | `src/propagate.js`, `logic.js`: confinement, pairs/triples of lines, structured removals and bounded contradiction reasoning. Its optional hypothesis-based reasoning is distinct from proof by direct propagation. |
| [Official game](https://murdoku.com/play/) | Browser observation, 2026-11-01 | How to Play, Keywords and Advanced describe occupancy, same-room orthogonal adjacency, group reservations and intersecting exclusions. The current interface separates draft marks from committed placements. |

## Official shipped module

User-supplied URL: [puzzle-core-Cla4GAxx.js](https://murdoku.com/play/assets/puzzle-core-Cla4GAxx.js).

Downloaded size: 72,856 bytes. SHA-256: `ce83d491051375d8ff1d1069cfa910fe9d18ab2bfcb48d5d07e9fcf893d369ec`.

Static inspection and REA analysis were limited to this one file; its imported language module and the rest of the application were not reconstructed. The file contains the furniture catalogue, glossary, puzzle-data loader, labels and clue annotation helpers. This is not evidence of a procedural generator elsewhere on the site.

Concrete points relevant to our model:

- The catalogue distinguishes occupiable objects, obstacles and special objects with no ordinary occupancy flag. The live catalogue marks beds occupiable, consistent with our chosen variant; do not replace this from one fan solver's example.
- Adjacency stays within a room and excludes diagonals. Directional relations can cross room boundaries.
- Window/door geometry is represented by edges, rather than inferred from a cell's parity. The loader also handles subareas, carpets and compound objects.
- Player hint strings can come from puzzle data. Their presence does not establish how the puzzle or hints were generated.

## Implemented in our game

1. **Reserved line groups.** If two or three people collectively have only that many rows/columns available, other people lose those lines. Too many people for the available lines is a contradiction. This works on rectangular boards without assuming that every column is occupied.
2. **Structured explanations.** Deductions retain removed cells and the immediate people used by a cross-reference or line group. The hint panel uses those dependencies instead of listing every earlier placement from the initial walkthrough.
3. **Hints from the player's state.** Placed people and manual crosses are fed into propagation. Pencil notes remain hypotheses. A conflicting placement or necessary crossed-out cell is flagged before offering a new placement. Neither this path nor the deduction engine reads the stored answer or invokes exhaustive search.
4. **Engine defect fixed.** Named local functions captured as closures now apply their default parameters in the function body, like arrow functions. This was necessary for the new reasoning code to behave equally on interpreter, AOT and QuickJS.

These are independent implementations of standard constraint reasoning. No external algorithm code was copied into the game. The owner subsequently requested a separate local archive of official reference assets and puzzle data; see the collection below. Four repository roots had no licence file or package licence declaration in the inspected checkout; the Hendrik solver declares MIT. Public access alone is not treated as a licence to copy.

## Next priorities

- Rate difficulty from the techniques actually required, the number of dependent steps and the initial candidate freedom. Existing level-specific clue selection is useful but does not provide a calibrated difficulty guarantee.
- Store windows as explicit exterior wall segments and have drawing and clues use the same geometry. Our current window rule and drawing agree, but their fixed top/bottom parity pattern limits variety.
- Add progressive hints: first name the relevant people/clues, then show the elimination, and reveal the position only on request.
- Resume a case after closing, with a versioned save keyed by its seed/rule version. Keep private pencil marks separate from factual placements.
- Variable cast sizes, multi-cell furniture, subareas and multiple floors require changes to the shared model and both solvers; they are not cosmetic board options.

## Subsequent official generator and reference collection

A second public chunk, [generator-BVUnAzaL.js](https://murdoku.com/play/assets/generator-BVUnAzaL.js), does contain a procedural generator. Static inspection shows seeded layout/furniture construction, difficulty-weighted clue atoms, an exact solution counter capped at two, a separate explained solving pass, and clue strengthening when ambiguity remains. The code also exposes worker execution and a main-thread fallback. This updates the earlier one-file scope; the puzzle-core module itself was not the generator.

The UI exposes 6×6–9×9 generation and easy/medium/hard choices. The larger authored cases are therefore useful references without implying that this generator supports every authored board size or mechanic.

At the owner's request, [the local reference collection](references/official/index.html) now contains 42 original puzzle JSONs, 629 SVGs (268 furniture/tile assets, 345 portrait layers, 16 floor textures), 149 object definitions, portrait colour tables and the exact 24-Hour Delivery palettes. The public catalogue has 73 entries, but only the 42 actually requested by the logged-out page were downloaded. Neither secret catalogue entries nor additional puzzle URLs were fetched.

The archive validates checksums and SVG syntax. Its offline statistics handle both legacy coordinate conventions and current row/column keys; a rectangular test catches transposition mistakes. The statistics are observations of source data, not proof that our solver already supports all official clue types. Official assets remain separate from the prototype's runtime assets.

No Z3 runtime dependency, new asset generation, publication or iPhone deployment was performed in this pass.
