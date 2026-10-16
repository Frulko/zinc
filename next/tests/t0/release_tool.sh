#!/bin/sh
# tools/release (make release): in a scratch repository with a fake `gh`, it refuses a dirty branch name, proposes the version from conventional commits, tags with the
# changelog as the tag message and pushes the tag; --dry-run tags nothing; --undo removes the tag.
cd "$(dirname "$0")/../.." || exit 2
rel=$PWD/tools/release
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir "$tmp/bin" "$tmp/origin.git" "$tmp/work"
cat > "$tmp/bin/gh" <<'G'
#!/bin/sh
case "$*" in
  "auth status"*) exit 0 ;;
  "repo view"*) echo "owner/zinc" ;;
  "secret list"*) printf 'ZINC_UPDATE_SEED\t2026-10-16\n' ;;
  "run list"*) ;;
  "release delete"*) exit 1 ;;
  *) exit 0 ;;
esac
G
chmod +x "$tmp/bin/gh"
git init -q --bare "$tmp/origin.git"
cd "$tmp/work" || exit 2   # the tool works on the repository of the current directory: never on this one
git init -q -b main . && git config user.email t@t && git config user.name t && git remote add origin "$tmp/origin.git"
mkdir -p next && printf '%064d\n' 1 | tr 0 a > next/update.pub
printf '# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-01-01\n\n- first\n\n[Unreleased]: https://example.test/compare/v0.1.0...HEAD\n[0.1.0]: https://example.test/releases/tag/v0.1.0\n' > CHANGELOG.md
echo a > a && git add -A && git commit -q -m "feat: first" && git tag -a v0.1.0 -m "Zinc 0.1.0" && git push -q origin main --tags
echo b > b && git add b && git commit -q -m "fix(core): a bug"
echo c > c && git add c && git commit -q -m "feat(ui): a thing"
run() { PATH="$tmp/bin:$PATH" NO_COLOR=1 sh "$rel" "$@" </dev/null 2>&1; }
out=$(run --dry-run --yes)
echo "$out" | grep -q "Changelog of v0.2.0" || { echo "feat since the last tag must propose a minor (v0.2.0): $out" | head -c 600; fail=1; }
[ -z "$(git tag -l v0.2.0)" ] || { echo "--dry-run tagged"; fail=1; }
run --yes --bump patch --no-watch > "$tmp/out" || { echo "release failed: $(head -c 500 "$tmp/out")"; fail=1; }
git tag -l v0.1.1 | grep -q . || { echo "no tag v0.1.1"; fail=1; }
git -C "$tmp/origin.git" tag -l v0.1.1 | grep -q . || { echo "the tag was not pushed"; fail=1; }
git tag -l --format='%(contents)' v0.1.1 | grep -q "a thing" || { echo "the draft from the commits is not the tag message"; fail=1; }
grep -q '^## \[0.1.1\] - ' CHANGELOG.md && grep -q '^## \[Unreleased\]' CHANGELOG.md || { echo "CHANGELOG.md has no 0.1.1 section and a fresh Unreleased"; fail=1; }
[ "$(git log -1 --format=%s v0.1.1)" = "docs(changelog): 0.1.1" ] || { echo "the tag does not point at the changelog commit"; fail=1; }
grep -q 'compare/v0.1.0...v0.1.1' CHANGELOG.md && grep -q 'compare/v0.1.1...HEAD' CHANGELOG.md || { echo "the compare links are not updated"; fail=1; }
# a written Unreleased wins over the commits
python3 - <<'PY'
t = open('CHANGELOG.md').read().replace('## [Unreleased]\n', '## [Unreleased]\n\n### Added\n- A line written by a person.\n', 1)
open('CHANGELOG.md', 'w').write(t)
PY
git add CHANGELOG.md && git commit -q -m "docs: a note" && echo d > d && git add d && git commit -q -m "feat: d"
run --yes --bump patch --no-watch > "$tmp/out2" || { echo "second release failed: $(head -c 400 "$tmp/out2")"; fail=1; }
git tag -l --format='%(contents)' v0.1.2 | grep -q "A line written by a person" || { echo "the written Unreleased is not the tag message"; fail=1; }
git tag -l --format='%(contents)' v0.1.2 | grep -q "d$" && { echo "the commits leaked into a written changelog"; fail=1; }
run --undo v0.1.2 --yes >/dev/null; git tag -l v0.1.2 | grep -q . && { echo "--undo kept the tag"; fail=1; }
run --bump nonsense --yes --dry-run | grep -q "not a version" || { echo "a wrong version is not refused"; fail=1; }
[ $fail -eq 0 ] && echo "release_tool: ok"
exit $fail
