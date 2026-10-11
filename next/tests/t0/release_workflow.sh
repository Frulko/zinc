#!/bin/sh
# The release of .github/workflows/zinc-next.yml (ZN-329): the workflow passes actionlint (when installed); its "Update manifest" step, run here with a test key,
# writes a manifest that `zinc update` verifies and follows to the package; its "Release" step, run with a stand-in gh, releases the packages and says in the
# notes when the macOS package is unsigned or the manifests are missing. Skipped (77) without PyYAML.
cd "$(dirname "$0")/../.." || exit 2
python3 -c "import yaml" 2>/dev/null || { echo "release_workflow: no PyYAML"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
WF=../.github/workflows/zinc-next.yml
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
if command -v actionlint >/dev/null; then actionlint "$WF" || fail=1; fi
python3 - "$WF" "$tmp" <<'PY' || exit 1
import sys, yaml
wf = yaml.safe_load(open(sys.argv[1]))
on = wf.get("on") or wf.get(True)
assert "v*" in on["push"]["tags"], "no v* tag trigger"
rel = wf["jobs"]["release"]
assert rel["needs"] == "test" and "refs/tags/v" in rel["if"] and rel["permissions"]["contents"] == "write", "release job"
steps = {s.get("name"): s for s in wf["jobs"]["test"]["steps"]}
assert "Sign and notarize (macOS release)" in steps, "no signing step"
open(sys.argv[2] + "/manifest.sh", "w").write(steps["Update manifest (release)"]["run"].replace("${{ matrix.name }}", "macos-arm64"))
open(sys.argv[2] + "/release.sh", "w").write([s for s in rel["steps"] if s.get("name") == "Release"][0]["run"])
open(sys.argv[2] + "/sums.sh", "w").write([s for s in rel["steps"] if s.get("name") == "Installer and checksums"][0]["run"])
names = [m["name"] for m in wf["jobs"]["test"]["strategy"]["matrix"]["include"]]
assert {"macos-arm64", "macos-x86_64", "linux-x86_64", "linux-aarch64", "windows-x86_64"} <= set(names), "a platform has no release job: %s" % names
assert "Windows" not in steps["Package"]["if"], "the Windows job does not package"
# ZN-714: console programs cross-built for Windows on Linux, run on a Windows runner; both call the script a person can run (tools/windows-cross)
wc, wr = wf["jobs"]["windows-cross"], wf["jobs"]["windows-console"]
assert wr["needs"] == "windows-cross" and wr["runs-on"].startswith("windows-") and not wc["runs-on"].startswith("windows-"), "the Windows console jobs"
assert any("tools/windows-cross build" in s.get("run", "") for s in wc["steps"]) and any("tools/windows-cross check" in s.get("run", "") for s in wr["steps"]), "windows-cross is not called"
up = [s["with"] for s in wc["steps"] if "upload-artifact" in s.get("uses", "")][0]; down = [s["with"] for s in wr["steps"] if "download-artifact" in s.get("uses", "")][0]
assert up["name"] == down["name"], "the artifact names differ"
PY
"$Z" update-keygen > "$tmp/k"; seed=$(sed -n 's/^seed=//p' "$tmp/k"); pub=$(sed -n 's/^public=//p' "$tmp/k")
mkdir -p "$tmp/job/dist" "$tmp/job/build" "$tmp/bin"
ln -s "$Z" "$tmp/job/build/zinc"
echo "package" > "$tmp/job/dist/Zinc-9.1.0-macos-arm64.zip"
(cd "$tmp/job" && GITHUB_REF_NAME=v9.1.0 RUNNER_TEMP="$tmp" ZINC_UPDATE_SEED="$seed" bash -e "$tmp/manifest.sh") || { echo "release_workflow: the manifest step failed"; fail=1; }
out=$(ZINC_HOME="$tmp/home" ZINC_UPDATE_PUBKEY="$pub" "$Z" update "file://$tmp/job/dist/zinc-macos-arm64.manifest" 2>&1)
echo "$out" | grep -q "zinc 9.1.0 is available" && echo "$out" | grep -q "downloaded and verified" || { echo "release_workflow: zinc update does not follow the manifest: $out"; fail=1; }
(cd "$tmp/job" && GITHUB_REF_NAME=v9.1.0 RUNNER_TEMP="$tmp" ZINC_UPDATE_SEED= bash -e "$tmp/manifest.sh" >/dev/null) || { echo "release_workflow: without a key the manifest step fails"; fail=1; }
printf '#!/bin/sh\nprintf "%%s\\n" "$@" > "%s/gh.args"\n' "$tmp" > "$tmp/bin/gh"; chmod +x "$tmp/bin/gh"
mkdir -p "$tmp/r1/release" && cp "$tmp/job/dist/Zinc-9.1.0-macos-arm64.zip" "$tmp/r1/release/"
# ZN-718: the installer and the checksums it reads are release assets
mkdir -p "$tmp/r1/next/tools" && cp tools/install.sh "$tmp/r1/next/tools/"
(cd "$tmp/r1" && bash -e "$tmp/sums.sh") || { echo "release_workflow: the checksums step failed"; fail=1; }
[ "$(cat "$tmp/r1/release/SHA256SUMS")" = "$(cd "$tmp/r1/release" && shasum -a 256 Zinc-9.1.0-macos-arm64.zip)" ] || { echo "release_workflow: SHA256SUMS: $(cat "$tmp/r1/release/SHA256SUMS")"; fail=1; }
(cd "$tmp/r1" && PATH="$tmp/bin:$PATH" GITHUB_REF_NAME=v9.1.0 bash -e "$tmp/release.sh" >/dev/null) || { echo "release_workflow: the release step failed"; fail=1; }
grep -q "^release/install.sh$" "$tmp/gh.args" && grep -q "^release/SHA256SUMS$" "$tmp/gh.args" || { echo "release_workflow: install.sh and SHA256SUMS are not attached"; fail=1; }
grep -q "^release/Zinc-9.1.0-macos-arm64.zip$" "$tmp/gh.args" || { echo "release_workflow: the package is not attached"; fail=1; }
grep -q "not signed" "$tmp/gh.args" && grep -q "No update manifests" "$tmp/gh.args" || { echo "release_workflow: the notes do not say unsigned / no manifests: $(cat "$tmp/gh.args")"; fail=1; }
mkdir -p "$tmp/r2/release" && cp "$tmp/job/dist/"* "$tmp/r2/release/" && touch "$tmp/r2/release/.signed"
(cd "$tmp/r2" && PATH="$tmp/bin:$PATH" GITHUB_REF_NAME=v9.1.0 bash -e "$tmp/release.sh" >/dev/null) || { echo "release_workflow: the signed release step failed"; fail=1; }
grep -q "not signed\|No update manifests" "$tmp/gh.args" && { echo "release_workflow: a signed release with manifests says otherwise"; fail=1; }
grep -q "^release/zinc-macos-arm64.manifest$" "$tmp/gh.args" && ! grep -q "\.signed" "$tmp/gh.args" || { echo "release_workflow: the manifest is not attached, or the marker is: $(cat "$tmp/gh.args")"; fail=1; }
# ZN-714: the half of tools/windows-cross that runs on Windows, here on stand-in programs: one prints its frozen output, the other does not
mkdir -p "$tmp/wc" && printf '#!/bin/sh\nprintf "a\\r\\nb\\r\\n"\n' > "$tmp/wc/good.exe" && printf 'a\nb\n' > "$tmp/wc/good.out" && chmod +x "$tmp/wc/good.exe"
[ "$(tools/windows-cross check "$tmp/wc")" = "PASS good" ] || { echo "release_workflow: windows-cross check does not pass a program that prints its output"; fail=1; }
cp "$tmp/wc/good.exe" "$tmp/wc/bad.exe" && echo other > "$tmp/wc/bad.out"
tools/windows-cross check "$tmp/wc" >/dev/null && { echo "release_workflow: windows-cross check passes a wrong output"; fail=1; }
tools/windows-cross check "$tmp/empty" >/dev/null 2>&1 && { echo "release_workflow: windows-cross check passes with no program"; fail=1; }
exit $fail
