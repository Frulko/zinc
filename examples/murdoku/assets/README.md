# Edition 02 runtime assets

The game now loads `manor-objects.png`, `manor-floors.png`, `cast-man.png` and `cast-woman.png`. Rebuild them with `python3 examples/murdoku/authoring/build_assets.py` (librsvg `rsvg-convert` and Pillow). These are rasterizations of selected SVGs retrieved from **https://murdoku.com/play/** at the owner's request, not original generated artwork. The archive's source URLs and SHA-256 hashes remain under `references/official/asset-library/manifest.json`; original ownership is unchanged. No publication or relicensing is implied.

`manor-assets.json` records all selected source paths and thirty-two portrait composition recipes. Each portrait combines source body, clothes and hair with skin/hair/clothes tint palettes and body-specific layer scaling. Assembly is offline; the runtime only selects atlas cells. The atlas builder asserts every resulting sprite is nonempty. Furniture IDs follow the order of its `objects` array, matching `src/model.ts`; only armchairs, carpets, beds and hammocks accept people. Floors use subdued texture opacity under the UI grid. Walls, windows and doors are native drawing commands driven by the generated architecture masks, rather than decorative bitmap overlays.

The following sections document older experiments, retained as source history and **not loaded by the Edition 02 renderer**.

# Furniture atlas

`furniture.png`: original generated RGBA atlas, 1536×1024, six 512×512 cells, made with the built-in imagegen tool on 2026-10-31. Used directly by `Manor.ts` with `drawImageRect`; alpha is preserved. No external runtime service or asset dependency.

Row-major cells: fern, sage armchair, walnut bookcase, brass candleholder, flowering pink plant, Persian rug.

Generation prompt:

> Production sprite atlas for a cozy illustrated manor detective puzzle. Exactly six isolated furniture sprites in a strict 3 columns by 2 rows equal-cell atlas, centered with transparent padding. Row 1: lush potted fern in terracotta; luxurious sage-green upholstered armchair, carved walnut arms; walnut bookcase with colorful books and shelf details. Row 2: brass candleholder with ivory candle and golden flame; flowering potted plant with pink blossoms; rectangular Persian rug in burgundy, ochre and cream, botanical border, central medallion and fringes. Polished hand-painted storybook board game illustration, delicate brown ink contours, warm watercolor/gouache texture, subtle soft contact shadows, muted antique palette. Orthographic overhead assets, no isometric perspective. Objects occupy about 70 percent of each cell. Transparent background, no floor, text, labels, UI or people. Landscape 3:2 atlas, equal spacing. Readable at 64 pixels.

The objects are decorative landmarks, not impassable obstacles. An occupied furniture cell means the person is at that landmark (or seated there), as described by the testimony.

## Manor expansion and modular portraits

The following original atlases were generated with the built-in imagegen tool on 2026-10-31, inspected, copied into this project and consumed by the game. No image service is needed at runtime. All character/decor sheets preserve their alpha; `floors.png` is opaque.

| File | Contents |
|---|---|
| `manor-decor.png` | Twelve manor props: dining table, writing desk, piano, fireplace, bed, sofa, side table, clock, billiard table, bathtub, stove, globe |
| `floors.png` | Four floor surfaces: oak herringbone, sage checkerboard, walnut planks, terracotta/cream marble |
| `portrait-heads.png` | Four skin-tone head/neck bases in each of two masculine/feminine rows; noses/lips belong to this layer |
| `portrait-eyes.png` | Four eye/brow color sets per row |
| `portrait-hair.png` | Four masculine and four feminine hairstyles |
| `portrait-clothes.png` | Four masculine and four feminine period outfits |
| `portrait-accessories.png` | Four glasses on the first row; four beard/moustache styles on the second |

Portrait atlas tiles are selected independently. `Portrait.tsx` registers the sheets with separate destination transforms because the generator did not preserve identical padding. `Manor.ts` uses explicit silhouette source rectangles for the expansion atlas because wide furniture has irregular spacing; original `furniture.png` uses a regular 3×2 grid. Source coordinates are deliberately calibrated to the checked-in images.

### Prompt set

Shared style for the decor and portrait calls:

> Polished hand-painted storybook manor mystery board game illustration, delicate dark brown ink contours, warm watercolor/gouache texture, refined muted antique palette. Genuine transparent background, no colored backdrop, no checkerboard, no text, labels, watermark or UI. Each sprite fully inside its own equal square tile with transparent margins, no overlap. Production game asset atlas.

Manor expansion:

> Landscape 4 columns by 3 rows strict atlas of 12 isolated furniture pieces. Orthographic top-down for a Cluedo-like country manor. Row 1: polished oval walnut dining table set with two porcelain plates; antique mahogany writing desk with papers and inkpot; grand piano with ivory keyboard; small carved stone fireplace with warm embers. Row 2: elegant cream double bed with pillows and burgundy coverlet; long sage velvet sofa; ornate round marble side table; tall dark wooden grandfather clock. Row 3: billiard table with green baize and balls; copper bathtub; dark wooden kitchen stove; ornate floor-standing globe. Each centered and readable at 64px, richly detailed, coherent scale, no floor, no people.

Shared requested portrait registration (actual generated padding is corrected in the compositor):

> Each equal square tile is a full bust portrait canvas, normalized coordinates 0..100. Fixed front-facing camera, no tilt. Head center x50 y43, head oval width34 height44 spanning x33..67 y21..65; neck x43..57 y62..76; shoulders span x18..82 y76..96. All sprites share exact proportions. Strict 4 columns by 2 rows atlas.

Per-layer subjects appended to that registration:

- Heads: only bald head and neck, blank eye sockets, no hair/clothes/shoulders, naturally drawn nose/mouth/ears. Masculine jawlines on row 1, feminine softer jawlines on row 2. Each row: fair peach, olive tan, warm brown, deep brown. Adults 25–55, subtle nose/lip variety.
- Hair: hair-only overlays, transparent face openings, no skin/eyes/neck/clothes. Row 1: chestnut side part, black tight cropped curls, silver swept-back, copper short waves. Row 2: auburn bob, black shoulder-length waves, silver bun, blonde side-part bob. Keep eye openings clear.
- Eyes: only paired open eyes and brows, transparent surroundings; eyes at x42/x58 y42, brows y36. Each row: brown/dark brows, blue/light brown brows, green/auburn brows, hazel/grey brows. Row 1 masculine, row 2 feminine, visible whites and irises, no head/nose/mouth/hair.
- Clothes: shoulder/chest only, no head/skin/hair/hands, transparent neckline. Row 1: burgundy tweed/waistcoat, navy suit/bowtie, moss cardigan/white shirt, camel waistcoat/dark tie. Row 2: teal Edwardian blouse/brooch, ivory blouse/burgundy vest, plum silk dress, forest jacket/cream blouse. Rich textile, buttons and stitch details.

Accessories were generated in a separate 4×2 transparent atlas: straight-on gold round, tortoiseshell rectangular, silver oval and black round glasses; then chestnut goatee, salt-and-pepper full beard, dark handlebar moustache and copper boxed beard. The prompt requested isolated overlays with transparent mouth openings and the shared ink/watercolor antique style.

Floors were generated in a separate opaque 2×2 square full-bleed atlas: honey oak herringbone, muted sage/ivory checkerboard, deep walnut wide planks and cream/terracotta diamond marble. The prompt requested flat overhead, subtle grain, low contrast, no props/walls/frames/text and independently repeating quadrant edges. The game stretches each surface over one room rather than relying on perfect seamlessness.


## Coherent portraits (previous runtime)

`portraits-female.png` and `portraits-male.png` each contain sixteen complete bust illustrations on a 4×4 grid. They replace the earlier layer composition, which did not align consistently. Rows select four skin tones; columns select four hairstyle families. Face, eyes and outfit are painted together. The previous portrait layer atlases remain as generation experiments and are not referenced by the runtime.

Built-in imagegen prompt for each atlas, 2026-10-31:

> Production portrait atlas for a warm storybook detective board game. Exactly sixteen complete adult women/men bust portraits in a strict 4 columns by 4 rows equal-square-cell atlas. Each portrait self-contained head, hair, eyes, face and clothed shoulders, no separate layers. Friendly elegant simplified storybook gouache illustration, clear ink contours, soft rounded facial shapes, small natural illustrated eyes, simple noses and gentle expressions. Charming board game character cards, not realistic or anatomical, no photo, skin pores, glossy eyes, empty sockets, exaggerated wrinkles or creepy doll faces. Antique muted burgundy, sage, navy, cream and ochre garments. Identical front-facing head-and-shoulders framing, transparent margins. Four skin-tone rows: light peach, olive/tan, warm brown, deep brown. Women hairstyle columns: auburn bob, black soft curls, silver bun, blonde waves; men: chestnut side part, black cropped curls, silver swept-back, copper waves. Diverse adults 25–60 in period blouses/jackets/dresses or tweed suits/waistcoats/cardigans. Coherent whole portraits, square atlas, genuine transparency, no text, labels, frames or watermark. Pleasant and readable at 48 pixels.

## Clue dictionary

`clue-dictionary.json` is the canonical source for 400 authored French templates across 40 typed semantic families. It is not an image asset. Scope, target, exclusivity and negation are metadata, separate from sentence variation. Compile edits with `python3 examples/murdoku/tools/compile-phrases.py`; never edit the generated `src/phrases.ts` by hand.
