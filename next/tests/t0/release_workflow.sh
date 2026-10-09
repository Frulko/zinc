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
(cd "$tmp/r1" && PATH="$tmp/bin:$PATH" GITHUB_REF_NAME=v9.1.0 bash -e "$tmp/release.sh" >/dev/null) || { echo "release_workflow: the release step failed"; fail=1; }
grep -q "^release/Zinc-9.1.0-macos-arm64.zip$" "$tmp/gh.args" || { echo "release_workflow: the package is not attached"; fail=1; }
grep -q "not signed" "$tmp/gh.args" && grep -q "No update manifests" "$tmp/gh.args" || { echo "release_workflow: the notes do not say unsigned / no manifests: $(cat "$tmp/gh.args")"; fail=1; }
mkdir -p "$tmp/r2/release" && cp "$tmp/job/dist/"* "$tmp/r2/release/" && touch "$tmp/r2/release/.signed"
(cd "$tmp/r2" && PATH="$tmp/bin:$PATH" GITHUB_REF_NAME=v9.1.0 bash -e "$tmp/release.sh" >/dev/null) || { echo "release_workflow: the signed release step failed"; fail=1; }
grep -q "not signed\|No update manifests" "$tmp/gh.args" && { echo "release_workflow: a signed release with manifests says otherwise"; fail=1; }
grep -q "^release/zinc-macos-arm64.manifest$" "$tmp/gh.args" && ! grep -q "\.signed" "$tmp/gh.args" || { echo "release_workflow: the manifest is not attached, or the marker is: $(cat "$tmp/gh.args")"; fail=1; }
exit $fail
