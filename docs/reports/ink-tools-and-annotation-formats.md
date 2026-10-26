# Ink tools and annotation formats (ZN-844, 2026-10-26)

The owner asked for a palette of writing tools comparable to xochitl's (the reMarkable's own app), and for a save/export that a computer
can read the annotations from, using a standard where one exists. This report is the research and the choice; the code is `zinc:ink`
(`plugins/ink`) and `InkPalette` in `zinc:remarkable` (`plugins/remarkable`), wired into Zinc PDF (`app/pdf`).

## xochitl's tools (reMarkable Paper Pro, OS 3.x)

The tool ids come from the open `.rm` v6 format (rmscene's `Pen` enum, reverse engineered by the community, matches the files xochitl
writes); the rendering rules from rmc's SVG exporter (`rmc/exporters/writing_tools.py`), the closest public description of how each
pen draws.

| Tool | `.rm` v6 ids | How it draws (rmc's model of xochitl) |
|---|---|---|
| Ballpoint | 2, 15 | width and darkness grow with pressure, thin out with speed |
| Fineliner | 4, 17 | constant width (1.8 x base), no pressure |
| Marker | 3, 16 | width from the tilt, smoothed over the last segment |
| Pencil | 1, 14 | width from pressure and tilt; opacity from pressure (grain) |
| Mechanical pencil | 7, 13 | thin, constant, 0.7 opacity |
| Calligraphy | 21 | width from pressure and the stroke's direction (a broad nib) |
| Paintbrush | 0, 12 | width from pressure and tilt; the colour fades toward white with less pressure |
| Highlighter | 5, 18 | wide (15 px), square cap, translucent (about 0.2-0.3); passes darken |
| Shader | 23 | wide (12 px), very translucent (0.1): shading that builds up |
| Eraser | 6 | erases what it touches; "erase area" 8 (a lasso) and "erase all" (the page) |

Widths: three presets (thin, medium, thick). Undo and redo, a lasso selection (move, resize, copy). Paper Pro colours (OS 3.x): nine
pen colours, black, grey, white, blue, red, green, yellow, cyan, magenta; the highlighter has its own set (yellow, green, pink, and
blue/grey on newer releases). rmc's RGB values, which we reuse so a page looks the same here, in xochitl and in an export: black
`#000000`, grey `#909090`, white `#ffffff`, blue `#4e69c9`, red `#b33e39`, green `#a1d87d`, yellow `#f7e851`, cyan `#8bd0e5`,
magenta `#b782cd`; highlighter yellow `#fbf719`, pink `#ffc0cb`.

Sources: rmscene `scene_items.py` (`Pen`, `PenColor`) <https://github.com/ricklupton/rmscene>, rmc `writing_tools.py`
<https://github.com/ricklupton/rmc>, reMarkable's Paper Pro announcement and reviews (nine colours, the shader, the layering highlighter):
<https://news.remarkable.com/remarkable-unveils-remarkable-paper-pro-the-worlds-thinnest-paper-tablet-with-a-color-display>,
<https://liliputing.com/remarkable-paper-pro-review-a-purpose-built-writing-tablet-with-a-better-display/>.

## What zinc:ink does of it

Tools: ballpoint (the old pen: pressure width), fineliner (constant), marker (wider, softer pressure curve), pencil (lighter where it
presses less), calligraphy (a 45 degree nib: thick across, hairline along), highlighter (5 x the width, alpha 90/255, one polyline so
it does not darken at its own joins, drawn under the other ink); the stroke eraser, the area eraser (a dragged rectangle takes the
strokes with a point inside), erase all, undo and redo. Our pens have pressure but no tilt or speed: the Marker's tilt is not in the
gfx pen queue yet, so the marker and calligraphy use pressure and direction only.

Not done: mechanical pencil, paintbrush, shader (each is one more `segWidth`/`segColor` rule), the lasso (selection and move), passes
of the highlighter that darken on each other (needs a multiply blend in the raster).

## Standards

| Format | What it is | Desktop reads it | Fidelity for us | Effort |
|---|---|---|---|---|
| Native JSON (`zinc:ink` `toJSON`) | ours: points with pressure, tool, colour, width | any script | lossless | done |
| SVG 1.1 | vector drawing, W3C | every browser, Inkscape, Illustrator, Figma | the look, not the pressure samples | done (`toSVG`) |
| PDF `/Ink` annotation (ISO 32000-1 §12.5.6.13) | `/InkList` paths, `/C` colour, `/BS` width, `/CA` opacity | every PDF reader (Preview, Acrobat, browsers, Okular) | one width a stroke | done in `app/pdf` through PDFium |
| PDF `/Highlight` (§12.5.6.10) | `/QuadPoints` over text | every PDF reader | needs the text boxes under the stroke | not done |
| W3C InkML (2011 Rec.) | traces with channels (X, Y, F pressure, tilt, time), brushes | handwriting recognisers, few apps | lossless | small (a writer like toSVG) |
| W3C Web Annotation Data Model (2017 Rec.) | JSON-LD: a body (an SVG) targeting a resource with selectors | Hypothesis-like tools | the anchoring, not the ink | small, no consumer here |
| Xournal++ `.xopp` | gzipped XML: `<stroke tool="pen|highlighter" color width="w0 w1 ...">` | Xournal++ (Linux/Mac/Windows) | per-point width: close | small (needs gzip: zlib is vendored) |
| reMarkable `.rm` v6 | tagged binary blocks (scene tree, CRDT sequences) | xochitl, rmc, rmscene | full xochitl fidelity | large (write the CRDT blocks; reverse engineered, changes with OS releases) |

Scores (RULES.md §4, 1 to 5, weights interop 3, fidelity 2, effort 2, risk 1):

| Choice | Interop | Fidelity | Effort | Risk | Total |
|---|---|---|---|---|---|
| JSON + SVG + PDF `/Ink` | 5 | 4 | 5 | 5 | 38 |
| + InkML | 2 | 5 | 4 | 5 | 29 |
| + `.xopp` | 3 | 4 | 4 | 4 | 29 |
| + `.rm` v6 | 3 | 5 | 1 | 1 | 22 |

**Choice**: the native JSON stays the lossless source (one file a page; a stroke without `"tool"` is a ballpoint, so every file written
before the tools reads and writes back unchanged), with two exports a computer reads with nothing installed: an SVG a page (each tool's
group carries `data-tool`, the highlighter is a translucent polyline with `mix-blend-mode:multiply` under the other ink, the pencil's
lighter runs carry their own colour) and, for PDFs, a copy with real `/Ink` annotations written by PDFium (`FPDFPage_CreateAnnot`,
`FPDFAnnot_AddInkStroke`, `FPDFAnnot_SetColor` with the alpha that becomes `/CA`: the highlighter is translucent in every reader).
No format code was written: PDFium is vendored (`plugins/pdf`), SVG is text. InkML and `.xopp` wait for a user who asks for them; `.rm`
v6 would let xochitl itself open our pages but is the most costly and the most fragile.

## How the computer gets the annotations

The files are already on the tablet's disk, so the simplest path is to copy them: the USB network the tablet always offers
(`10.11.99.1`, root over ssh, which every reMarkable owner with developer mode uses) needs nothing more on either side.

- Zinc PDF: `scp root@10.11.99.1:/home/root/zinc-docs/<name>.annotated.pdf .` (the PDF with its annotations, after **Export**), or the
  lossless pages `scp -r root@10.11.99.1:/home/root/zinc-docs/<name>.pdf.ink .`.
- Notes: `scp -r root@10.11.99.1:/home/root/zinc-notes .` (`page-<n>.json` and `page-<n>.svg`).
- A tablet that runs `zinc agent`: `zinc device pull /home/root/zinc-docs` does the same over the network, paired.

The relay of Zinc Web (`app/web-relay`) already serves files to the Mac, but it runs on the Mac and receives nothing from the tablet;
serving the exports from the hub is a later convenience, not needed to get the files.
