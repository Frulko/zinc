#!/bin/sh
# Plugin starter (ZN-354): `zinc new plugin` makes a plugin repository whose example runs and whose tests pass on the native part and on its sim; a
# project that adds it from git lists it in `zinc plugins` and runs it. The steps of the macOS leg and of the release job of the reusable workflow
# (.github/workflows/plugin.yml, which the starter's ci.yml calls) run here as written, in the layout of a GitHub runner (plugin/ and zinc/ side by
# side, `gh` recorded, not called): the binary is named by the cache key the project computed, the descriptor names the commit, a release without
# the secret or with a tag other than the version stops, and with them every file has a signature that verifies. The signed archive, added by URL
# as the README says, installs as a community plugin of the publisher of plugin.json, and a changed archive is refused. The README's Develop and
# by-hand release blocks run as written, every zinc command it names exists, and the matrix has the four targets. Skipped (77) without the pinned
# zig or PyYAML.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
zig=${ZINC_ZIG:-$(ls -d "${ZINC_HOME:-$HOME/.zinc}"/toolchains/zig-*/zig 2>/dev/null | head -1)}
[ -x "$zig" ] || { echo "plugin_starter: no pinned zig downloaded"; exit 77; }
python3 -c 'import yaml' 2>/dev/null || { echo "plugin_starter: no PyYAML to read the workflows"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC="$Z" ZINC_ZIG="$zig" ZINC_HOME="$tmp/home" ZINC_PREBUILT=0
unset ZINC_PUBLISHER_SEED
git() { command git -c user.name=Publisher -c user.email=publisher@example.com -c init.defaultBranch=main "$@"; }
fail=0
ws="$tmp/ws"   # $GITHUB_WORKSPACE: the plugin's checkout and the engine's, side by side
p="$ws/plugin"
mkdir -p "$ws/zinc/build" && ln -s "$Z" "$ws/zinc/build/zinc" && ln -s "$PWD/tools" "$ws/zinc/tools"
"$Z" new plugin "$tmp/hello-zinc" >/dev/null && mv "$tmp/hello-zinc" "$p" || { echo "plugin_starter: zinc new plugin failed"; exit 1; }
grep -q "requireNative<Spec>('hello_zinc')" "$p/native/hello-zinc.spec.ts" && grep -q "Nativehello_zinc\* zinc_create_hello_zinc()" "$p/native/hello-zinc.host.cpp" || { echo "plugin_starter: the native names are not filled"; fail=1; }
[ "$(cd "$p" && "$Z" run 2>&1 | tail -1)" = 'checksum of "zinc": -1256488513' ] || { echo "plugin_starter: the example does not run on the plugin: $(cd "$p" && "$Z" run 2>&1 | tail -3)"; fail=1; }
(cd "$p" && ZINC_NATIVE=sim "$Z" test 2>&1 | tail -1 | grep -q ' 0 failure') || { echo "plugin_starter: the tests fail on the sim"; fail=1; }
git -C "$p" init -q && git -C "$p" add -A && git -C "$p" commit -qm "a plugin" || exit 1

# a project adds it (AC 1)
"$Z" new cli "$tmp/app" >/dev/null || exit 1
"$Z" add "file://$p" "$tmp/app" > "$tmp/out" 2>&1 || { echo "plugin_starter: zinc add of the plugin's repository failed: $(cat "$tmp/out")"; fail=1; }
"$Z" plugins "$tmp/app" 2>/dev/null | grep -q "^  zinc:hello-zinc  *macos,linux " || { echo "plugin_starter: zinc plugins does not list it: $("$Z" plugins "$tmp/app" 2>&1)"; fail=1; }
printf "import { checksum } from 'zinc:hello-zinc';\nconsole.log(checksum('hello'));\n" > "$tmp/app/src/main.ts"
[ "$(cd "$tmp/app" && "$Z" run 2>&1 | tail -1)" = 1335831723 ] || { echo "plugin_starter: the project does not run the added plugin"; fail=1; }
key=$("$Z" plugin-build hello-zinc "$tmp/app" 2>&1 | sed -n 's#.*/plugins/hello-zinc-\([0-9a-f]*\)/.*#\1#p' | head -1)

# the workflow's steps as written (AC 2): `${{ }}` as on macos-arm64 (no matrix.cross), then the release job of a tag
"$Z" update-keygen > "$tmp/keys"
seed=$(sed -n 's/^seed=//p' "$tmp/keys"); pub=$(sed -n 's/^public=//p' "$tmp/keys")
python3 - "$p/plugin.json" "$pub" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
m["publisher"] = {"name": "Publisher", "publicKey": sys.argv[2]}   # README, "Publish a signed release", step 1
json.dump(m, open(sys.argv[1], "w"), indent=2)
PY
git -C "$p" commit -qam "publisher key" && git -C "$p" tag v0.1.0 || exit 1
mkdir -p "$tmp/bin" && printf '#!/bin/sh\nprintf "%%s\\n" "$@" > "%s/gh-args"\n' "$tmp" > "$tmp/bin/gh" && chmod +x "$tmp/bin/gh"
step() {   # job, step name, VAR=value...: one step of plugin.yml in the workspace, with GitHub's `run` shell; its exit code
  job=$1 name=$2; shift 2
  python3 - "$PWD/.github/workflows/plugin.yml" "$job" "$name" > "$tmp/step" <<'PY' || return 99
import re, sys, yaml
steps = yaml.safe_load(open(sys.argv[1]))["jobs"][sys.argv[2]]["steps"]
s = [x for x in steps if x.get("name") == sys.argv[3]][0]
print(s.get("working-directory", "."))
print(re.sub(r"\$\{\{.*?\}\}", "", s["run"]))
PY
  (cd "$ws/$(head -1 "$tmp/step")" && env -u ZINC PATH="$tmp/bin:$PATH" GITHUB_REPOSITORY=publisher/hello-zinc "$@" bash --noprofile --norc -eo pipefail -c "$(tail -n +2 "$tmp/step")")
}
step build Tests > "$tmp/out" 2>&1 && tail -1 "$tmp/out" | grep -q ' 0 failure' || { echo "plugin_starter: the Tests step fails: $(tail -3 "$tmp/out")"; fail=1; }
step build Pack > "$tmp/out" 2>&1 || { echo "plugin_starter: the Pack step fails: $(cat "$tmp/out")"; fail=1; }
t=$(uname -s | sed 's/Darwin/macos/; s/Linux/linux/')
[ -n "$key" ] && [ "$(ls "$ws/dist/binaries/$t" 2>&1)" = "hello-zinc-$key.tar" ] || { echo "plugin_starter: the binary is not named by the project's cache key $key: $(cd "$ws/dist" && find . -type f)"; fail=1; }
d="$ws/dist/plugins/hello-zinc/0.1.0.json"
grep -q "\"commit\": \"$(git -C "$p" rev-parse HEAD)\"" "$d" && grep -q '"module": "zinc:hello-zinc"' "$d" || { echo "plugin_starter: the descriptor: $(cat "$d")"; fail=1; }
step release "The publisher's key" > "$tmp/out" 2>&1 && { echo "plugin_starter: a release without ZINC_PUBLISHER_SEED goes on"; fail=1; }
grep -q "::error::no ZINC_PUBLISHER_SEED" "$tmp/out" || { echo "plugin_starter: no reason given without the secret: $(cat "$tmp/out")"; fail=1; }
step release "The tag is plugin.json's version" GITHUB_REF_NAME=v0.2.0 > /dev/null 2>&1 && { echo "plugin_starter: a tag that is not the version is released"; fail=1; }
step release "The tag is plugin.json's version" GITHUB_REF_NAME=v0.1.0 > "$tmp/out" 2>&1 || { echo "plugin_starter: the tag of the version is refused: $(cat "$tmp/out")"; fail=1; }
step release "The publisher's key" ZINC_PUBLISHER_SEED="$seed" > /dev/null 2>&1 || { echo "plugin_starter: the release stops with the secret"; fail=1; }
step release Sign ZINC_PUBLISHER_SEED="$seed" > "$tmp/out" 2>&1 || { echo "plugin_starter: the Sign step fails: $(cat "$tmp/out")"; fail=1; }
step release Release GITHUB_REF_NAME=v0.1.0 > "$tmp/out" 2>&1 || { echo "plugin_starter: the Release step fails: $(cat "$tmp/out")"; fail=1; }
for f in $(cd "$ws/dist" && find . -type f ! -name '*.sig' ! -name 'index-*.tar'); do
  "$Z" verify "$ws/dist/$f" --key "$pub" > /dev/null 2>&1 || { echo "plugin_starter: $f has no valid signature"; fail=1; }
done
grep -qx "dist/hello-zinc-0.1.0.tar.gz" "$tmp/gh-args" && grep -qx "dist/hello-zinc-0.1.0.tar.gz.sig" "$tmp/gh-args" && grep -qx "dist/index-v0.1.0.tar" "$tmp/gh-args" || { echo "plugin_starter: the release's files: $(cat "$tmp/gh-args")"; fail=1; }
[ "$(tar tf "$ws/dist/index-v0.1.0.tar" | grep -c '\.sig$')" = 2 ] || { echo "plugin_starter: the index archive lacks the signatures: $(tar tf "$ws/dist/index-v0.1.0.tar")"; fail=1; }

# a user adds the signed release by its URL (AC 3): community, the publisher printed, the key pinned; a changed archive is refused
"$Z" new cli "$tmp/user" >/dev/null || exit 1
"$Z" add "file://$ws/dist/hello-zinc-0.1.0.tar.gz" "$tmp/user" > "$tmp/out" 2>&1 || { echo "plugin_starter: the signed release cannot be added: $(cat "$tmp/out")"; fail=1; }
grep -q community "$tmp/out" && grep -q Publisher "$tmp/out" && grep -q "$pub" "$tmp/user/zinc.lock" || { echo "plugin_starter: the release is not added as the publisher's community plugin: $(cat "$tmp/out")"; fail=1; }
printf 'x' >> "$ws/dist/hello-zinc-0.1.0.tar.gz"
"$Z" new cli "$tmp/user2" >/dev/null && "$Z" add "file://$ws/dist/hello-zinc-0.1.0.tar.gz" "$tmp/user2" > /dev/null 2>&1 && { echo "plugin_starter: an archive changed after signing is added"; fail=1; }

# the README's "Develop" and "by hand" blocks run as written (zinc on the PATH; <seed>, <public> and the project filled in)
readme_block() {   # the ```sh block of the README that contains $1, unindented
  python3 - "$p/README.md" "$1" <<'PY'
import re, sys
blocks = [b for b in re.findall(r"```sh\n(.*?)```", open(sys.argv[1]).read(), re.S) if sys.argv[2] in b]
print("\n".join(l.strip() for l in blocks[0].splitlines()) if blocks else "false")
PY
}
ln -s "$Z" "$tmp/bin/zinc"
(cd "$p" && PATH="$tmp/bin:$PATH" bash -e -c "$(readme_block 'zinc run')") > "$tmp/out" 2>&1 || { echo "plugin_starter: the README's Develop block fails: $(tail -3 "$tmp/out")"; fail=1; }
"$Z" new cli "$tmp/some-project" >/dev/null || exit 1
(cd "$p" && PATH="$tmp/bin:$PATH" bash -e -c "$(readme_block 'git archive' | sed "s/<seed>/$seed/; s/<public>/$pub/; s#\.\./some-project#$tmp/some-project#")") > "$tmp/out" 2>&1 || { echo "plugin_starter: the README's release by hand fails: $(tail -3 "$tmp/out")"; fail=1; }
grep -q "$pub" "$tmp/some-project/zinc.lock" 2>/dev/null || { echo "plugin_starter: the README's release by hand does not pin the publisher's key"; fail=1; }

# the workflows and the README's commands
python3 - .github/workflows/plugin.yml "$p/.github/workflows/ci.yml" <<'PY' || fail=1
import sys, yaml
w, c = (yaml.safe_load(open(f)) for f in sys.argv[1:3])
bad = []
if "workflow_call" not in (w.get("on") or w.get(True)): bad.append("plugin.yml is not a reusable workflow")   # YAML 1.1 reads the key `on` as true
targets = [x["target"] for x in w["jobs"]["build"]["strategy"]["matrix"]["include"]]
if targets != ["macos-arm64", "linux-x86_64", "linux-aarch64", "linux-armhf"]: bad.append("the matrix is %s" % targets)
job = c["jobs"]["plugin"]
if not job["uses"].startswith("zinc-engine/zinc/.github/workflows/plugin.yml@") or job.get("secrets") != "inherit": bad.append("ci.yml calls %s" % job)
for b in bad: print("plugin_starter: " + b)
sys.exit(1 if bad else 0)
PY
python3 - "$p/README.md" > "$tmp/commands" <<'PY'
import re, sys
t = open(sys.argv[1]).read()
cmds = set(re.findall(r"`zinc ([a-z][a-z-]*)", t))
for block in re.findall(r"```sh\n(.*?)```", t, re.S): cmds |= set(re.findall(r"(?:^|[\s=;&|])zinc ([a-z][a-z-]*)", block, re.M))
print("\n".join(sorted(cmds)))
PY
for c in $(cat "$tmp/commands"); do
  "$Z" help "$c" > /dev/null 2>&1 || { echo "plugin_starter: the README names a command zinc does not have: zinc $c"; fail=1; }
done
[ "$(wc -l < "$tmp/commands")" -ge 8 ] || { echo "plugin_starter: the README's commands were not read: $(cat "$tmp/commands")"; fail=1; }
[ $fail -eq 0 ] && echo "plugin starter: ok"
exit $fail
