# Checking and migrating a project: zinc lint, zinc migrate

Two commands of the `zinc` binary; nothing to install. Design and the tools compared: [reports/zinc-lint-migrate.md](../reports/zinc-lint-migrate.md).

## zinc lint: will it work there?

```sh
zinc lint                       # this project, on the targets its zinc.json names (else this machine)
zinc lint --target esp32        # one target
zinc lint --all-targets         # every profile of targets/capabilities.json, and a matrix
zinc lint --json                # for an editor or CI
zinc lint --rules               # the rules, their severity and their fix
```

Each finding says where, which rule, on which targets, and what to do:

```
src/main.tsx:9:22: warning ui-tier [esp32]: bg-conic: a conic gradient is drawn as the average of its stops on tier T0 (fix: a two-stop linear gradient along an axis, or an image)
zinc.json: error project-requires [esp32]: requires heap>=8M (esp32 has heap 160K) (fix: another target, or fewer requirements)
```

`--all-targets` ends with the matrix (`examples/hero`):

```
target   tier status   reason
macos    T4   ok
rpi1     T2   ok
wasm     T3   warns    plugin-targets: plugin video is not made for this target (its plugin.json targets: macos, linux, rpi1, webos)
esp32    T0   refuses  project-requires: requires heap>=8M (esp32 has heap 160K)
```

What it checks:

- **The source** (every `.tsx` / `.jsx` file): `class` in JSX (`jsx-classname`) and lowercase tags (`jsx-capitalised-tag`), the
  spellings the engine refuses (Z0006, Z0007), with the codemod that fixes them.
- **Each target**, with the program loaded the way `zinc run` loads it there (its `x.<target>.tsx` files included): files that do not
  load (`compile`), plugins whose `plugin.json` `requires` do not hold (`plugin-requires`) or whose `targets` leave the target out
  (`plugin-targets`), `zinc.json` `requires` (`project-requires`) and `ui.layout` (`ui-layout`), modules with a `@requires` comment
  (`module-requires`), styles the target's UI tier draws more simply (`ui-tier`: conic gradients below T3, gradients beyond two stops
  along an axis and repeated images on T0 and T1), fixed sizes wider or taller than a fixed screen (`screen-size`), and the assets against
  the target's budgets (`assets-flash`, `assets-memory`, `texture-size`; estimates, `zinc assets build` measures).

The exit code is 1 only for an error on the source or on a target in force (`--target`, else the targets of `zinc.json`): a refusal of a
target the project never named shows in the matrix without failing the command.

## zinc migrate: the language changed, rewrite the project

When Zinc changes a spelling or an API, it ships a codemod with it, and the error that the old spelling now gets names it:

```
src/app.tsx:3:16: error Z0006: `class` in JSX: write `className`: JSX: write className, not class, on <View>
zinc: 1 error. Rename the attribute to className (...); `zinc migrate jsx-classname --apply` rewrites a whole project. ...
```

```sh
zinc migrate --list                  # the codemods: id, the engine change, the error it fixes
zinc migrate                         # every codemod over the current directory: prints the diff, writes nothing
zinc migrate --apply                 # writes the files
zinc migrate jsx-classname src/      # one codemod, one directory (or a file)
```

| id | fixes | what it rewrites |
|---|---|---|
| `jsx-classname` | Z0006 | `class=` on JSX elements, and the prop of components: `class?: string`, `props.class`, `{ class: c }` |
| `jsx-capitalised-tags` | Z0007 | `<view>` `<View>`, `<text>` `<Text>`, `<button>` `<Button>`, `<image>` and `<img>` `<Image>`, `<scroll>` `<ScrollView>`, `<canvas>`, `<input>`, `<textarea>` `<TextArea>`, `<div>` `<View>`, `<span>` and `<p>` `<Text>` |

A codemod reads the code as the engine does: strings, comments and the text of JSX elements are left alone, and so is Markdown prose
(only `tsx`, `jsx`, `ts` and `js` fences of `.md` files are rewritten). A second run changes nothing. A lowercase tag with no component
to map to (`<frobnicate>`) is printed for you to rename.
