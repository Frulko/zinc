#!/bin/sh
# First five minutes (ZN-711), the path of docs/guide/01-getting-started.md:
# - every template of templates/ makes a project in an empty directory that `zinc run` runs headless for a few frames (exit 0, nothing on
#   stderr; the two servers listen until the timeout stops them);
# - a first change (the text of the game template) changes the frame on screen;
# - six beginner mistakes each print the file, the line and what to do next: tests/golden/first-run/<mistake>.txt, the project directory
#   written <project> (FIRST_RUN_UPDATE=1 rewrites them); the path relative to the project, the source line with a caret under the span,
#   one error for a misspelt import rather than its consequences, and the same lines on the compiled engine and QuickJS (ZN-774.34);
# - the guide quotes the first line of each message;
# - a bare `zinc`, `zinc --help` and a misspelt command lead to the list of commands, grouped (Start here, Build and ship);
# - zinc new with no argument asks nothing, at a terminal or not: my-game, then my-game-2 (ZN-774.32); zinc new --pick: the usage and nothing
#   written without a terminal; through a pty, the question (arrows) and the name; for a kind written in several styles, how to write it,
#   each style its template (ZN-774.15); the next steps after zinc new; the first bare zinc at a terminal greets once, and its language is saved (ZN-774.02);
# - install.sh and install.ps1 end with zinc --next-steps, which the Homebrew caveats repeat word for word;
# - zinc check says what it checked; zinc dev's first start says which file to change, that a save shows it, and that Ctrl+C stops (ZN-774.03);
# - zinc run and zinc dev print one progress line at most by default, the steps with --verbose (ZN-774.32).
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
gold="$PWD/tests/golden/first-run"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
tmp=$(cd "$tmp" && pwd -P)
fail=0
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1
for d in templates/*/; do
  t=$(basename "$d")
  p="$tmp/$t"
  "$Z" new "$t" "$p" >/dev/null || { echo "zinc new $t failed"; fail=1; continue; }
  (cd "$p" && ZINC_STORAGE="$tmp/storage.$t" ZINC_FRAMES=3 timeout $((5 * ${ZN_WAIT_SCALE:-1})) "$Z" run >"$tmp/out.$t" 2>"$tmp/err.$t")
  rc=$?
  case "$t" in
    server|service) [ $rc -eq 124 ] && grep -q 'listening on http' "$tmp/out.$t" || { echo "$t: zinc run exits $rc without listening: $(head -3 "$tmp/err.$t")"; fail=1; } ;;
    *) [ $rc -eq 0 ] || { echo "$t: zinc run exits $rc: $(head -3 "$tmp/err.$t")"; fail=1; } ;;
  esac
  [ -s "$tmp/err.$t" ] && { echo "$t: zinc run writes on stderr: $(head -3 "$tmp/err.$t")"; fail=1; }
done

# a first change: another text in src/main.ts, another frame
g="$tmp/game"
out=$(cd "$g" && "$Z" check 2>&1)
echo "$out" | grep -Eqx 'ok: src/main.ts (checked \(types and imports\)|and its imports checked \([0-9]+ files\)), no errors' || { echo "zinc check does not say what it checked: $out"; fail=1; }
(cd "$g" && unset ZINC_STEPS && ZINC_DEVTOOLS_PORT=0 ZINC_FRAMES=2 exec "$Z" dev > "$tmp/dev.log" 2>&1) &
dev=$!
n=0; while [ $n -lt 200 ] && ! grep -q "program exited" "$tmp/dev.log"; do sleep 0.05; n=$((n + 1)); done
kill $dev 2>/dev/null; wait $dev 2>/dev/null
[ "$(grep -c '^zinc dev: v1 started' "$tmp/dev.log")" = 1 ] && ! grep -Eq '^  [a-z]|^zinc run |^zinc: plugins|using Next implementation' "$tmp/dev.log" \
  || { echo "zinc dev prints more than one progress line: $(head -12 "$tmp/dev.log")"; fail=1; }
grep -qx "zinc dev: change src/main.ts and save: the program updates at once. Ctrl+C stops." "$tmp/dev.log" && ! grep -q "after the save" "$tmp/dev.log" \
  || { echo "zinc dev does not start with what to do: $(head -5 "$tmp/dev.log")"; fail=1; }
cp "$g/src/main.ts" "$tmp/main.ts"
frame() { (cd "$g" && ZINC_FRAMES=2 ZINC_FRAMEHASH=last "$Z" run 2>&1 | grep framehash | awk '{print $5}'); }
before=$(frame)
sed 's/arrows to move/hello from me/' "$tmp/main.ts" > "$g/src/main.ts"
grep -q 'hello from me' "$g/src/main.ts" || { echo "the game template has no 'arrows to move' text to change (the guide changes it)"; fail=1; }
after=$(frame)
[ -n "$before" ] && [ -n "$after" ] && [ "$before" != "$after" ] || { echo "a changed text does not change the frame: $before, $after"; fail=1; }

# the first native run: one line; the next: none; --verbose: the steps
quiet() { (cd "$g" && unset ZINC_STEPS && ZINC_HOME="$tmp/runhome" ZINC_FRAMES=1 "$Z" run --native "$@" 2>&1 >/dev/null); }
out=$(quiet)
[ "$out" = "zinc: compiling for this machine, once (a few seconds; the next runs start at once)" ] || { echo "the first native zinc run is not one line: $out"; fail=1; }
out=$(quiet); [ -z "$out" ] || { echo "a cached zinc run prints: $out"; fail=1; }
quiet --verbose | grep -q '^  run        native' || { echo "zinc run --verbose does not print the steps: $(quiet --verbose | head -3)"; fail=1; }

# the six mistakes: mistake <name> <project> <zinc arguments...>, after the files were edited
mistake() {
  name=$1; proj=$2; shift 2
  (cd "$proj" && ZINC_FRAMES=2 "$Z" "$@" 2>&1 >/dev/null | sed "s|$proj|<project>|g") > "$tmp/$name.txt"
  [ -n "$FIRST_RUN_UPDATE" ] && { mkdir -p "$gold"; cp "$tmp/$name.txt" "$gold/$name.txt"; }
  cmp -s "$tmp/$name.txt" "$gold/$name.txt" || { echo "mistake $name: $(diff "$gold/$name.txt" "$tmp/$name.txt" 2>&1 | head -6)"; fail=1; }
  # every golden names a file and a line, and says what to do
  grep -Eq '^(<project>/)?src/[a-z.]+:[0-9]+:[0-9]+: error Z[0-9]+: ' "$tmp/$name.txt" || { echo "mistake $name: no file:line:col: error line"; fail=1; }
  # the guide quotes the message as it is printed
  grep -qF "$(sed -n 1p "$tmp/$name.txt" | sed 's|^<project>/||; s|<project>|my-game|g')" docs/guide/01-getting-started.md || { echo "mistake $name: docs/guide/01-getting-started.md does not quote its first line"; fail=1; }
  grep -Eq '^zinc: [0-9]+ errors?[.,].*zinc explain Z' "$tmp/$name.txt" || { echo "mistake $name: no closing line with the fix and zinc explain"; fail=1; }
}
# the same mistake on another engine prints the same lines (ZN-774.34): same <name> <project> <zinc arguments...>
same() {
  name=$1; proj=$2; shift 2
  out=$(cd "$proj" && ZINC_FRAMES=2 "$Z" "$@" 2>&1 >/dev/null | sed "s|$proj|<project>|g")
  [ "$out" = "$(cat "$gold/$name.txt")" ] || { echo "mistake $name with $*: $(printf '%s\n' "$out" | head -4)"; fail=1; }
}
# 1. a misspelt import: a name of a module, then the path of a file of the project
sed 's/isDown, Btn/isDwon, Btn/' "$tmp/main.ts" > "$g/src/main.ts"
mistake import-name "$g" run
same import-name "$g" run --native   # one error, not its five consequences, on the compiled engine too
echo 'export const speed = 120;' > "$g/src/config.ts"
{ echo "import { speed } from './confg';"; cat "$tmp/main.ts"; } > "$g/src/main.ts"
mistake import-path "$g" run
# 2. a type error
{ cat "$tmp/main.ts"; echo 'let score: number = "ten";'; } > "$g/src/main.ts"
mistake type-error "$g" run
# 3. a zinc: module that does not exist
{ echo "import { get } from 'zinc:stoarge';"; cat "$tmp/main.ts"; } > "$g/src/main.ts"
mistake unknown-module "$g" run
# 4. a plugin that is not installed
{ echo "import { burst } from 'zinc:confetti';"; cat "$tmp/main.ts"; } > "$g/src/main.ts"
mistake plugin-missing "$g" run
# 5. a JSX tag left open (the title of the remarkable template loses its </Text>)
r="$tmp/remarkable"
cp "$r/src/main.tsx" "$tmp/main.tsx"
sed 's|My app</Text>|My app|' "$tmp/main.tsx" > "$r/src/main.tsx"
cmp -s "$tmp/main.tsx" "$r/src/main.tsx" && { echo "the remarkable template has no 'My app</Text>' to break"; fail=1; }
mistake jsx-open "$r" run
same jsx-open "$r" run src/main.tsx --engine quickjs   # QuickJS lowers the JSX with the same diagnostics
printf 'let b = (1 + ;\n' > "$g/src/syntax.ts"   # and strips the types after the same parse
[ "$(cd "$g" && "$Z" run src/syntax.ts --engine quickjs 2>&1)" = "$(cd "$g" && "$Z" run src/syntax.ts 2>&1)" ] \
  && (cd "$g" && "$Z" run src/syntax.ts 2>&1) | grep -qxF "   | $(printf '%13s')^" || { echo "a syntax error on QuickJS: $(cd "$g" && "$Z" run src/syntax.ts --engine quickjs 2>&1 | head -3)"; fail=1; }
rm "$g/src/syntax.ts"
# 6. a file that is not there
cp "$tmp/main.ts" "$g/src/main.ts"
mistake missing-file "$g" run src/mian.ts

# lost at the first command: the list of commands, the closest command
"$Z" 2>/dev/null </dev/null | grep -q '^  new  *make a project$' || { echo "a bare zinc does not list the commands"; fail=1; }
"$Z" help | grep -q '^Start here' && "$Z" help | grep -q '^Build and ship' && ! "$Z" help | grep -q '^  lsp ' || { echo "zinc help is not grouped"; fail=1; }
"$Z" help --all | grep -q '^  lsp  *language server' || { echo "zinc help --all does not list every command"; fail=1; }
for c in new run dev check doctor explain build; do
  [ "$("$Z" help $c | sed -n 3p)" = "Examples:" ] && [ "$("$Z" help $c | sed -n 4,5p | grep -c "^  zinc $c")" = 2 ] || { echo "zinc help $c does not start with the usage and two examples"; fail=1; }
done
[ "$("$Z" hlep 2>&1)" = "zinc: unknown command 'hlep': did you mean 'zinc help'? (zinc help lists the commands)" ] || { echo "zinc hlep: $("$Z" hlep 2>&1)"; fail=1; }
"$Z" version | grep -q '^zinc-next ' || { echo "zinc version does not print the version"; fail=1; }
"$Z" --help | grep -q '^  run  *run a program or project' || { echo "zinc --help does not list the commands"; fail=1; }
[ "$("$Z" rnu 2>&1)" = "zinc: unknown command 'rnu': did you mean 'zinc run'? (zinc help lists the commands)" ] || { echo "zinc rnu: $("$Z" rnu 2>&1)"; fail=1; }

# zinc new --pick: a script gets the usage, exit 2, and nothing is written
mkdir "$tmp/empty" && (cd "$tmp/empty" && "$Z" new --pick </dev/null >"$tmp/new.out" 2>&1); rc=$?
[ $rc -eq 2 ] && grep -q '^usage: zinc new' "$tmp/new.out" && [ -z "$(ls -A "$tmp/empty")" ] || { echo "zinc new --pick without a terminal: exit $rc, $(ls -A "$tmp/empty" | head -3)"; fail=1; }
(cd "$tmp/empty" && CI=1 "$Z" new --pick >/dev/null 2>&1 </dev/null); [ $? -eq 2 ] || { echo "zinc new --pick under CI does not exit 2"; fail=1; }
# zinc new alone, without a terminal: my-game, then my-game-2
(cd "$tmp/empty" && "$Z" new </dev/null >/dev/null 2>&1 && "$Z" new </dev/null >/dev/null 2>&1)
[ -f "$tmp/empty/my-game/zinc.json" ] && [ -f "$tmp/empty/my-game-2/zinc.json" ] || { echo "zinc new without a terminal did not make my-game and my-game-2: $(ls -A "$tmp/empty")"; fail=1; }
"$Z" new --list | grep -q '^Games$' && "$Z" new --list | grep -q '^  desktop-app  ' && ! "$Z" new --list | grep -q 'from the index' || { echo "zinc new --list is not grouped by what it makes"; fail=1; }
"$Z" new --list | grep -q '^  canvas  ' && "$Z" new --list | grep -q '^  stage  ' || { echo "zinc new --list does not show the canvas and stage styles"; fail=1; }
out=$("$Z" new cli "$tmp/next")
for want in "Created $tmp/next (cli)." "zinc dev" "src/main.ts" "https://frulko.github.io/zinc/docs/learn/" "zinc tour"; do
  case "$out" in *"$want"*) ;; *) echo "zinc new does not end with the next steps ($want): $out"; fail=1 ;; esac
done
for r in templates/*/README.md; do sed -n 3p "$r" | grep -q '^## Next steps$' && grep -q 'zinc dev' "$r" || { echo "$r does not start with the next steps"; fail=1; }; done

# through a terminal: the question of zinc new, then the first-run welcome. terminal.py <cwd> <home> <keys...> -- argv: each key waits for
# its text (before '=>') then types the rest; prints what the terminal showed, exits with the program's code
cat > "$tmp/terminal.py" <<'PY'
import os, pty, select, sys, time
cwd, home = sys.argv[1], sys.argv[2]
sep = sys.argv.index("--")
keys, argv = sys.argv[3:sep], sys.argv[sep + 1:]
env = {k: v for k, v in os.environ.items() if k not in ("CI", "ZINC_LANG", "LANGUAGE", "LC_ALL", "LC_MESSAGES")}
env.update(ZINC_HOME=home, TERM="xterm-256color", LANG="C")
pid, fd = pty.fork()
if pid == 0:
    os.chdir(cwd); os.execve(argv[0], argv, env)
out = b""
def pump(until, limit):
    global out
    end = time.time() + limit
    while time.time() < end and (until is None or until not in out):
        if select.select([fd], [], [], 0.1)[0]:
            try: chunk = os.read(fd, 4096)
            except OSError: return False
            if not chunk: return False
            out += chunk
    return True
for k in keys:
    wait, send = k.split("=>", 1)
    pump(wait.encode(), 20)
    os.write(fd, send.encode().decode("unicode_escape").encode("latin-1"))
pump(None, 20 if keys else 5)
_, status = os.waitpid(pid, 0)
sys.stdout.write(out.decode("utf-8", "replace"))
sys.exit(os.waitstatus_to_exitcode(status))
PY
mkdir "$tmp/wiz" "$tmp/bare"
python3 "$tmp/terminal.py" "$tmp/bare" "$tmp/home" -- "$Z" new > "$tmp/bare.out" 2>&1; rc=$?
[ $rc -eq 0 ] && [ -f "$tmp/bare/my-game/zinc.json" ] && grep -q 'Created my-game (game)' "$tmp/bare.out" && ! grep -q '?' "$tmp/bare.out" \
  && (cd "$tmp/bare/my-game" && ZINC_FRAMES=2 "$Z" run >/dev/null 2>&1) || { echo "bare zinc new at a terminal asks or fails: exit $rc, $(head -5 "$tmp/bare.out")"; fail=1; }
python3 "$tmp/terminal.py" "$tmp/wiz" "$tmp/home" "What do you want to make?=>\x1b[B\x1b[B\r" "How do you want to write it?=>\r" "Name of the new folder=>my-app\r" -- "$Z" new --pick > "$tmp/wiz.out" 2>&1
rc=$?
[ $rc -eq 0 ] && [ -f "$tmp/wiz/my-app/zinc.json" ] && [ -d "$tmp/wiz/my-app/src/pages" ] || { echo "the zinc new question (down twice, Enter, Enter, my-app) did not make the third kind in its first style, desktop-app: exit $rc, $(tail -5 "$tmp/wiz.out")"; fail=1; }
grep -q 'Created my-app (desktop-app)' "$tmp/wiz.out" || { echo "the question does not end with the next steps: $(tail -5 "$tmp/wiz.out")"; fail=1; }
# the styles are asked after the kind, not offered as kinds: an app with windows is an interface or a scene
grep -q 'Interface: describe the screen once in JSX' "$tmp/wiz.out" && grep -q 'Scene: objects that draw themselves' "$tmp/wiz.out" && ! grep -q 'Canvas: ' "$tmp/wiz.out" \
  && ! grep -q 'a scene of objects you tap and drag' "$tmp/wiz.out" && ! grep -q "a drawing on the web's Canvas API" "$tmp/wiz.out" \
  || { echo "an app with windows is not asked Interface or Scene, or the styles are kinds too: $(tail -12 "$tmp/wiz.out")"; fail=1; }
TERM=dumb python3 "$tmp/terminal.py" "$tmp/wiz" "$tmp/home" "Type a number=>1\r" "How do you want to write it?=>2\r" "Name of the new folder=>\r" -- /usr/bin/env TERM=dumb "$Z" new --pick > "$tmp/wiz2.out" 2>&1
[ -f "$tmp/wiz/my-stage/zinc.json" ] && grep -q "from 'zinc:stage'" "$tmp/wiz/my-stage/src/main.ts" && grep -q '^   1\. Drawing: ' "$tmp/wiz2.out" && grep -q '^   3\. Canvas: ' "$tmp/wiz2.out" \
  || { echo "the numbered question (TERM=dumb: 1, a game; 2, Scene; Enter) did not make my-stage from the three styles of a game: $(tail -8 "$tmp/wiz2.out")"; fail=1; }
TERM=dumb python3 "$tmp/terminal.py" "$tmp/wiz" "$tmp/home" "Type a number=>6\r" "Name of the new folder=>\r" -- /usr/bin/env TERM=dumb "$Z" new --pick > "$tmp/wiz3.out" 2>&1
[ -f "$tmp/wiz/my-cli/zinc.json" ] && ! grep -q 'How do you want to write it' "$tmp/wiz3.out" || { echo "the numbered question (TERM=dumb, 6, Enter) did not make my-cli without a style question: $(tail -5 "$tmp/wiz3.out")"; fail=1; }
# the welcome: once, at a terminal; its language saved beside the keys of others
mkdir -p "$tmp/home" && printf '{"atelier.theme": "dark"}\n' > "$tmp/home/config.json"
python3 "$tmp/terminal.py" "$tmp/wiz" "$tmp/home" "Type 1 to 5=>2\r" -- "$Z" > "$tmp/welcome.out" 2>&1; rc=$?
[ $rc -eq 0 ] && grep -q 'Welcome to Zinc' "$tmp/welcome.out" && grep -q 'Trois étapes pour commencer' "$tmp/welcome.out" && grep -q 'docs/learn/' "$tmp/welcome.out" \
  || { echo "the first bare zinc does not greet and switch to French: exit $rc, $(tail -8 "$tmp/welcome.out")"; fail=1; }
grep -q '"lang": "fr"' "$tmp/home/config.json" && grep -q '"welcomed"' "$tmp/home/config.json" && grep -q '"atelier.theme": "dark"' "$tmp/home/config.json" || { echo "the welcome did not save the language beside the other keys: $(cat "$tmp/home/config.json")"; fail=1; }
python3 "$tmp/terminal.py" "$tmp/wiz" "$tmp/home" -- "$Z" > "$tmp/again.out" 2>&1
grep -q 'Pour commencer' "$tmp/again.out" && ! grep -q 'Welcome\|Bienvenue' "$tmp/again.out" || { echo "the second bare zinc greets again or forgot the language: $(head -5 "$tmp/again.out")"; fail=1; }
python3 "$tmp/terminal.py" "$tmp/wiz" "$tmp/home2" -- /usr/bin/env CI=1 "$Z" > "$tmp/ci.out" 2>&1
! grep -q 'Welcome' "$tmp/ci.out" && [ ! -e "$tmp/home2/config.json" ] || { echo "the welcome shows under CI"; fail=1; }
ZINC_HOME="$tmp/home3" "$Z" </dev/null >/dev/null 2>&1; [ ! -e "$tmp/home3/config.json" ] || { echo "the welcome runs without a terminal"; fail=1; }

# the end of the installers: zinc --next-steps, the same lines in the Homebrew caveats
grep -q -- '--next-steps' tools/install.sh && grep -q -- '--next-steps' tools/install.ps1 || { echo "install.sh or install.ps1 does not end with zinc --next-steps"; fail=1; }
printf '%064d  zinc-9.9.9-macos-arm64.tar.gz\n' 0 > "$tmp/sums"
tools/homebrew-formula 9.9.9 "$tmp/sums" | sed -n '/<<~TXT/,/^ *TXT$/p' | sed 's/^ *//; s/  */ /g' > "$tmp/caveats"
ZINC_LANG=en "$Z" --next-steps | sed 's/^ *//; s/  */ /g' | while IFS= read -r l; do grep -qxF "$l" "$tmp/caveats" || echo "the Homebrew caveats lack: $l"; done > "$tmp/missing"
[ -s "$tmp/missing" ] && { cat "$tmp/missing"; fail=1; }
[ $fail -eq 0 ] && echo "first run: ok"
exit $fail
