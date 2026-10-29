# zinc:remarkable audit

## What it is
Components for apps on the reMarkable tablets: a status toolbar (clock, battery, exit), widgets, a system panel, an ink palette, an e-paper keyboard and the pen-mode switch.

## Targets and status
plugin.json: rmpp, macos (preview), linux; `requires` none. Description names only the status toolbar. Tested via `hub_app`, `pdf_reader`, `ink_tools` (rmpp simulator goldens). Docked-under-xochitl mode is experimental; the in-xochitl ink lane is open (ZN-834). Hardware runs depend on AppLoad patches in `integrations/remarkable-engine/appload`.

## What the docs have
- [x] README with the toolbar, widgets, Accueil, system panel, header docking, battery, InkPalette, keyboard, pen mode (dense prose)
- [x] bigger context in `docs/targets/remarkable-paper-pro.md`; screenshots exist (`docs/img/remarkable-dashboard.png`, `remarkable-notes.png`)
- [x] examples: `examples/remarkable/{dashboard,notes,quill-test}`, `app/hub`, `app/pdf`
- [ ] no `docs/plugins/remarkable.md`, no API table, no tutorial, no troubleshooting

## What is missing
1. `docs/plugins/remarkable.md` with an API table: `RemarkableApp` props, `WidgetSpec`, `RemarkableBar` props (`title`, `onHome`, `onQuit`), `RemarkableKeyboard` props, `InkPalette` props (`ink`, `widths`, `open`, `onChange`), `windowMode()`, `goHome()`, `tabletLayouts()`, `setPenMode()`, `appFolder()`, `PEN_COLORS`, `HIGHLIGHTER_COLORS`.
2. Embed the two existing screenshots in the README; add one of the widget card and one of the system panel (simulator: `zinc run --simulate`, ZINC_SHOT).
3. A tutorial "Your first reMarkable app" in 6 steps: new project, `RemarkableApp`, `RemarkableBar`, save on `onQuit`, ink canvas with `InkPalette`, deploy with `zinc device`. Hardware steps marked (hardware).
4. AppLoad installation and patch table (`0003`, `0005`) in one checklist, with what breaks without each.
5. Notes: e-ink refresh (`refresh_mode: ui`), pen mode costs about 1 s, French labels (Accueil, Quitter, Annuler) and how to localise.
6. Cross-link to the rmpp no-raw-probes warning (owner).

## Wrong or stale
- README says "(see Notes)" for `onQuit`; there is no Notes section.
- plugin.json description ("status toolbar: local clock, battery and app-owned exit") omits widgets, palette, keyboard, pen mode.
- Hard-coded French button labels are not mentioned as such.

## Suggested pages
Remarkable (API, generated) / Guide: designing for e-paper / Steps: first reMarkable app / Steps: widgets and Accueil / Steps: writing tools and keyboard / Notes: AppLoad patches, refresh modes, header docking / Examples: dashboard, notes with screenshots.
