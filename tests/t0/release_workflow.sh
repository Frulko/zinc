#!/bin/sh
# The release of .github/workflows/zinc-next.yml (ZN-329): the workflow passes actionlint (when installed); its "Update manifest" step, run here with a test key,
# writes the stable and beta manifests that `zinc update` verifies and follows to the CLI archive (unsigned, signature=none, refused by default, without the seed); its checksums step lists both downloads (the zinc CLI tar.gz, the Atelier app
# zip); its "Release" step, run with a stand-in gh, attaches both, says in the notes what each file is and when the macOS downloads are unsigned or the
# manifests are missing. Skipped (77) without PyYAML.
cd "$(dirname "$0")/../.." || exit 2
python3 -c "import yaml" 2>/dev/null || { echo "release_workflow: no PyYAML"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
WF=.github/workflows/zinc-next.yml
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
if command -v actionlint >/dev/null; then actionlint "$WF" || fail=1; fi
python3 - "$WF" "$tmp" <<'PY' || exit 1
import sys, yaml
wf = yaml.safe_load(open(sys.argv[1]))
on = wf.get("on") or wf.get(True)
assert "v*" in on["push"]["tags"], "no v* tag trigger"
rel = wf["jobs"]["release"]
assert {"package", "package-windows", "linux-cross", "test"} <= set(rel["needs"]) and "refs/tags/v" in rel["if"] and rel["permissions"]["contents"] == "write", "release job: %s" % rel["needs"]
downloads = [s["with"].get("pattern") for s in rel["steps"] if "download-artifact" in s.get("uses", "")]
assert {"package-*", "linux-*", "test-results-*"} <= set(downloads), "the release does not gather every download: %s" % downloads
steps = {s.get("name"): s for s in wf["jobs"]["package"]["steps"]}
sign = steps["Sign and notarize (macOS release)"]["run"]
assert "dist/Zinc-Atelier-*-macos-*.zip" in sign and "dist/zinc-*-macos-*.tar.gz" in sign, "the signing step does not sign both downloads"
assert "install_nocompiler" in steps["Smoke test of the CLI archive and the app"]["run"], "no smoke test of the downloads"
open(sys.argv[2] + "/manifest.sh", "w").write(steps["Update manifests (release)"]["run"].replace("${{ matrix.name }}", "macos-arm64"))
open(sys.argv[2] + "/release.sh", "w").write([s for s in rel["steps"] if s.get("name") == "Release"][0]["run"])
open(sys.argv[2] + "/sums.sh", "w").write([s for s in rel["steps"] if s.get("name") == "Installer and checksums"][0]["run"])
names = [m["name"] for m in wf["jobs"]["package"]["strategy"]["matrix"]["include"]]
assert {"macos-arm64", "macos-x86_64"} <= set(names), "a Mac has no package job: %s" % names   # Linux and Windows are off for now (owner, 2026-10-15)
# ZN-714: console programs cross-built for Windows on Linux, run on a Windows runner; both call the script a person can run (tools/windows-cross)
wc, wr = wf["jobs"]["windows-cross"], wf["jobs"]["windows-console"]
assert wr["needs"] == "windows-cross" and wr["runs-on"].startswith("windows-") and not wc["runs-on"].startswith("windows-"), "the Windows console jobs"
assert any("tools/windows-cross build" in s.get("run", "") for s in wc["steps"]) and any("tools/windows-cross check" in s.get("run", "") for s in wr["steps"]), "windows-cross is not called"
up = [s["with"] for s in wc["steps"] if "upload-artifact" in s.get("uses", "")][0]; down = [s["with"] for s in wr["steps"] if "download-artifact" in s.get("uses", "")][0]
assert up["name"] == down["name"], "the artifact names differ"
# the Linux CLI cross-built per architecture by the script a person runs (tools/build-linux), behind its own switch
lc = wf["jobs"]["linux-cross"]
assert "ZINC_LINUX_JOBS" in lc["if"] and any("tools/build-linux --arch" in s.get("run", "") for s in lc["steps"]), "linux-cross does not call tools/build-linux"
assert {m["arch"] for m in lc["strategy"]["matrix"]["include"]} == {"aarch64", "armhf", "x86_64", "i686"}, "linux-cross misses an architecture"
lsteps = {s.get("name"): s for s in lc["steps"]}
assert "update-sign" in lsteps["Update manifests (release)"]["run"] and "*.manifest" in [s for s in lc["steps"] if "upload-artifact" in s.get("uses", "")][0]["with"]["path"], "linux-cross writes or uploads no update manifest"
assert [s["with"]["name"] for s in lc["steps"] if "upload-artifact" in s.get("uses", "")][0].startswith("linux-"), "the Linux artifact does not match the release's linux-* download"
# the Windows download of Zinc Atelier: its launcher is built, packaged and started by the job
wsteps = {s.get("name"): s for s in wf["jobs"]["package-windows"]["steps"]}
assert "zinc-atelier" in wsteps["Build zinc.exe"]["run"] and "Zinc Atelier.exe" in wsteps["Smoke test of the app, unpacked"]["run"], "the Windows app is not built or not tried"
PY
"$Z" update-keygen > "$tmp/k"; seed=$(sed -n 's/^seed=//p' "$tmp/k"); pub=$(sed -n 's/^public=//p' "$tmp/k")
mkdir -p "$tmp/job/dist" "$tmp/job/build" "$tmp/bin"
ln -s "$Z" "$tmp/job/build/zinc"
cli=zinc-9.1.0-macos-arm64.tar.gz app=Zinc-Atelier-9.1.0-macos-arm64.zip
echo "cli" > "$tmp/job/dist/$cli"; echo "app" > "$tmp/job/dist/$app"; echo '{}' > "$tmp/job/dist/sizes-macos-cli.json"
(cd "$tmp/job" && GITHUB_REF_NAME=v9.1.0 RUNNER_TEMP="$tmp" ZINC_UPDATE_SEED="$seed" bash -e "$tmp/manifest.sh") || { echo "release_workflow: the manifest step failed"; fail=1; }
for m in zinc-macos-arm64 zinc-macos-arm64-beta; do
  out=$(ZINC_HOME="$tmp/home" ZINC_UPDATE_PUBKEY="$pub" "$Z" update --check "file://$tmp/job/dist/$m.manifest" 2>&1); rc=$?
  [ $rc -eq 10 ] && echo "$out" | grep -q "zinc 9.1.0 is available" && grep -qx "url=$cli" "$tmp/job/dist/$m.manifest" || { echo "release_workflow: $m.manifest does not verify or does not name the CLI archive ($rc): $out"; fail=1; }
done
# without the secret: unsigned manifests (signature=none) that zinc update refuses unless ZINC_UPDATE_ALLOW_UNSIGNED=1
mkdir -p "$tmp/job2/dist" "$tmp/job2/build" && cp "$tmp/job/dist/$cli" "$tmp/job2/dist/" && ln -s "$Z" "$tmp/job2/build/zinc"
(cd "$tmp/job2" && GITHUB_REF_NAME=v9.1.0 RUNNER_TEMP="$tmp" ZINC_UPDATE_SEED= bash -e "$tmp/manifest.sh" >/dev/null) || { echo "release_workflow: without a key the manifest step fails"; fail=1; }
u="file://$tmp/job2/dist/zinc-macos-arm64.manifest"
ZINC_HOME="$tmp/home" ZINC_UPDATE_PUBKEY="$pub" "$Z" update --check "$u" 2>&1 | grep -q "unsigned (signature=none" || { echo "release_workflow: an unsigned manifest is not refused"; fail=1; }
ZINC_HOME="$tmp/home" ZINC_UPDATE_ALLOW_UNSIGNED=1 "$Z" update --check "$u" >/dev/null 2>&1; [ $? -eq 10 ] || { echo "release_workflow: ZINC_UPDATE_ALLOW_UNSIGNED=1 does not accept the unsigned manifest"; fail=1; }
printf '#!/bin/sh\nprintf "%%s\\n" "$@" > "%s/gh.args"\n' "$tmp" > "$tmp/bin/gh"; chmod +x "$tmp/bin/gh"
mkdir -p "$tmp/r1/release" && cp "$tmp/job/dist/$cli" "$tmp/job/dist/$app" "$tmp/job/dist/sizes-macos-cli.json" "$tmp/job2/dist/"*.manifest "$tmp/r1/release/"
linux=zinc-9.1.0-linux-x86_64.tar.gz wapp=Zinc-Atelier-9.1.0-windows-x86_64.zip   # the Linux CLI (linux-cross) and the Windows app (package-windows)
echo "linux" > "$tmp/r1/release/$linux"; echo "wapp" > "$tmp/r1/release/$wapp"
# ZN-718: the installer and the checksums it reads are release assets; one line per download, the CLI and the app
mkdir -p "$tmp/r1/tools" && cp tools/install.sh tools/install.ps1 "$tmp/r1/tools/"
(cd "$tmp/r1" && bash -e "$tmp/sums.sh") || { echo "release_workflow: the checksums step failed"; fail=1; }
[ "$(cat "$tmp/r1/release/SHA256SUMS")" = "$(cd "$tmp/r1/release" && shasum -a 256 "$linux" "$cli" "$app" "$wapp")" ] || { echo "release_workflow: SHA256SUMS: $(cat "$tmp/r1/release/SHA256SUMS")"; fail=1; }
(cd "$tmp/r1" && PATH="$tmp/bin:$PATH" GITHUB_REF_NAME=v9.1.0 bash -e "$tmp/release.sh" >/dev/null) || { echo "release_workflow: the release step failed"; fail=1; }
grep -q "^release/install.sh$" "$tmp/gh.args" && grep -q "^release/SHA256SUMS$" "$tmp/gh.args" || { echo "release_workflow: install.sh and SHA256SUMS are not attached"; fail=1; }
grep -q "^release/$cli$" "$tmp/gh.args" && grep -q "^release/$app$" "$tmp/gh.args" || { echo "release_workflow: the CLI archive or the app is not attached"; fail=1; }
grep -q "^release/$linux$" "$tmp/gh.args" && grep -q "^release/$wapp$" "$tmp/gh.args" && grep -q "^release/install.ps1$" "$tmp/gh.args" || { echo "release_workflow: the Linux CLI, the Windows app or install.ps1 is not attached"; fail=1; }
grep -q "the zinc CLI for Linux" "$tmp/gh.args" && grep -q "the Zinc Atelier app for Windows" "$tmp/gh.args" || { echo "release_workflow: the notes do not name the Linux CLI and the Windows app"; fail=1; }
grep -q "sizes-" "$tmp/gh.args" && { echo "release_workflow: the size reports are attached"; fail=1; }
grep -q "the zinc CLI" "$tmp/gh.args" && grep -q "the Zinc Atelier app" "$tmp/gh.args" || { echo "release_workflow: the notes do not say what each file is"; fail=1; }
grep -q "not signed" "$tmp/gh.args" && grep -q "manifests are unsigned" "$tmp/gh.args" || { echo "release_workflow: the notes do not say unsigned downloads / manifests: $(cat "$tmp/gh.args")"; fail=1; }
mkdir -p "$tmp/r2/release" && cp "$tmp/job/dist/"* "$tmp/r2/release/" && touch "$tmp/r2/release/.signed"
(cd "$tmp/r2" && PATH="$tmp/bin:$PATH" GITHUB_REF_NAME=v9.1.0 bash -e "$tmp/release.sh" >/dev/null) || { echo "release_workflow: the signed release step failed"; fail=1; }
grep -q "not signed\|unsigned" "$tmp/gh.args" && { echo "release_workflow: a signed release with manifests says otherwise"; fail=1; }
grep -q "^release/zinc-macos-arm64.manifest$" "$tmp/gh.args" && grep -q "^release/zinc-macos-arm64-beta.manifest$" "$tmp/gh.args" && ! grep -q "\.signed" "$tmp/gh.args" || { echo "release_workflow: the manifest is not attached, or the marker is: $(cat "$tmp/gh.args")"; fail=1; }
# ZN-714: the half of tools/windows-cross that runs on Windows, here on stand-in programs: one prints its frozen output, the other does not
mkdir -p "$tmp/wc" && printf '#!/bin/sh\nprintf "a\\r\\nb\\r\\n"\n' > "$tmp/wc/good.exe" && printf 'a\nb\n' > "$tmp/wc/good.out" && chmod +x "$tmp/wc/good.exe"
[ "$(tools/windows-cross check "$tmp/wc")" = "PASS good" ] || { echo "release_workflow: windows-cross check does not pass a program that prints its output"; fail=1; }
cp "$tmp/wc/good.exe" "$tmp/wc/bad.exe" && echo other > "$tmp/wc/bad.out"
tools/windows-cross check "$tmp/wc" >/dev/null && { echo "release_workflow: windows-cross check passes a wrong output"; fail=1; }
tools/windows-cross check "$tmp/empty" >/dev/null 2>&1 && { echo "release_workflow: windows-cross check passes with no program"; fail=1; }
exit $fail
