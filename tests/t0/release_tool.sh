#!/bin/sh
# tools/release (make release): in a scratch repository with a fake `gh`, it refuses a dirty branch name, proposes the version from conventional commits, tags with the
# pending changelog as the tag message; failed/unwatched retries retain it and confirmed publication archives only its snapshot. All pushes use a local bare origin.
cd "$(dirname "$0")/../.." || exit 2
rel=$PWD/tools/release
archive=$PWD/tools/release-archive
notes_tool=$PWD/tools/release-notes
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir "$tmp/bin" "$tmp/origin.git" "$tmp/work"
cat > "$tmp/bin/gh" <<'G'
#!/bin/sh
case "$*" in
  "auth status"*) exit 0 ;;
  "repo view"*) echo "owner/zinc" ;;
  "secret list"*) printf 'ZINC_UPDATE_SEED\t2026-10-16\n' ;;
  "run list"*) echo 123 ;;
  "run watch"*) exit 1 ;;
  "release view"*) [ "${TEST_PUBLISHED:-}" = yes ] || exit 1; echo 2026-10-23 ;;
  "release delete"*) exit 1 ;;
  *) exit 0 ;;
esac
G
chmod +x "$tmp/bin/gh"
git init -q --bare "$tmp/origin.git"
cd "$tmp/work" || exit 2   # the tool works on the repository of the current directory: never on this one
git init -q -b main . && git config user.email t@t && git config user.name t && git remote add origin "$tmp/origin.git"
mkdir -p next && printf '%064d\n' 1 | tr 0 a > update.pub
printf '# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-01-01\n\n- first\n\n[Unreleased]: https://example.test/compare/v0.1.0...HEAD\n[0.1.0]: https://example.test/releases/tag/v0.1.0\n' > CHANGELOG.md
echo a > a && git add -A && git commit -q -m "feat: first" && git tag -a v0.1.0 -m "Zinc 0.1.0" && git push -q origin main --tags
git switch -q -c develop && git push -q origin develop   # the work happens on develop; a release moves main to it
echo b > b && git add b && git commit -q -m "fix(core): a bug"
echo c > c && git add c && git commit -q -m "feat(ui): a thing"
run() { PATH="$tmp/bin:$PATH" NO_COLOR=1 ZINC_RELEASE_RETRY_WAIT=0 sh "$rel" "$@" </dev/null 2>&1; }
out=$(run --dry-run --yes)
echo "$out" | grep -q "Changelog of v0.2.0" || { echo "feat since the last tag must propose a minor (v0.2.0): $out" | head -c 600; fail=1; }
[ -z "$(git tag -l v0.2.0)" ] || { echo "--dry-run tagged"; fail=1; }
echo 'uncommitted user edit' >> a
run --yes --bump patch --no-watch > "$tmp/dirty" && { echo "dirty release was allowed"; fail=1; }
grep -q 'commit or stash' "$tmp/dirty" && [ -z "$(git tag -l v0.1.1)" ] || { echo "dirty release did not stop before tagging"; fail=1; }
git checkout -- a
run --yes --bump patch --no-watch > "$tmp/out" || { echo "release failed: $(head -c 500 "$tmp/out")"; fail=1; }
git tag -l v0.1.1 | grep -q . || { echo "no tag v0.1.1"; fail=1; }
git -C "$tmp/origin.git" tag -l v0.1.1 | grep -q . || { echo "the tag was not pushed"; fail=1; }
t=$(git rev-parse 'v0.1.1^{commit}')
[ "$(git -C "$tmp/origin.git" rev-parse main)" = "$t" ] && [ "$(git -C "$tmp/origin.git" rev-parse develop)" = "$t" ] || { echo "main and develop on origin are not at the release"; fail=1; }
[ "$(git rev-parse main)" = "$t" ] || { echo "the local main did not follow the release"; fail=1; }
git tag -l --format='%(contents)' v0.1.1 | grep -q "a thing" || { echo "the draft from the commits is not the tag message"; fail=1; }
grep -q 'a thing' CHANGELOG.md && ! grep -q '^## \[0.1.1\]' CHANGELOG.md || { echo "unwatched release consumed Unreleased"; fail=1; }
[ "$(git log -1 --format=%s v0.1.1)" = "docs(changelog): prepare 0.1.1" ] || { echo "the tag does not snapshot the reviewed changelog"; fail=1; }
grep -q 'compare/v0.1.0...HEAD' CHANGELOG.md || { echo "unpublished compare link changed"; fail=1; }
run --yes --bump patch --dry-run > "$tmp/retry" || { echo "pending retry without another commit refused"; fail=1; }
grep -q 'a thing' "$tmp/retry" || { echo "retry without a commit lost pending notes"; fail=1; }
# a written Unreleased wins over the commits
python3 - <<'PY'
t = open('CHANGELOG.md').read().replace('## [Unreleased]\n', '## [Unreleased]\n\n### Added\n- A line written by a person.\n', 1)
open('CHANGELOG.md', 'w').write(t)
PY
git add CHANGELOG.md && git commit -q -m "docs: a note" && echo d > d && git add d && git commit -q -m "feat: d"
run --yes --bump patch > "$tmp/out2" && { echo "failed publication returned success"; fail=1; }
grep -q 'no release was published' "$tmp/out2" && grep -q 'A line written by a person' CHANGELOG.md && grep -q 'a thing' CHANGELOG.md || { echo "failed retry lost its notes"; fail=1; }
git tag -l --format='%(contents)' v0.1.2 | grep -q "A line written by a person" || { echo "the written Unreleased is not the tag message"; fail=1; }
git tag -l --format='%(contents)' v0.1.2 | grep -q "d$" && { echo "the commits leaked into a written changelog"; fail=1; }
# Archive only a confirmed public release, preserving notes committed while CI ran.
sha=$(git rev-parse 'v0.1.2^{commit}')
python3 - <<'END'
p = 'CHANGELOG.md'
s = open(p).read().replace('### Added', '### Added\n- A newer concurrent note.', 1)
open(p, 'w').write(s)
END
git add CHANGELOG.md && git commit -q -m "docs: concurrent note" && git push -q origin develop
before=$(git -C "$tmp/origin.git" rev-parse develop)
PATH="$tmp/bin:$PATH" GH_REPO=owner/zinc GITHUB_SHA="$sha" TAG=v0.1.2 bash "$archive" > "$tmp/archive.out" 2>&1 && { echo "unpublished release archived"; fail=1; }
[ "$(git -C "$tmp/origin.git" rev-parse develop)" = "$before" ] || { echo "failed archive changed develop"; fail=1; }
PATH="$tmp/bin:$PATH" TEST_PUBLISHED=yes GH_REPO=owner/zinc GITHUB_SHA="$sha" TAG=v0.1.2 bash "$archive" > "$tmp/archive.out" 2>&1 || { cat "$tmp/archive.out"; fail=1; }
git fetch -q origin develop && git merge --ff-only -q origin/develop
python3 - "$notes_tool" <<'END' || fail=1
import runpy, sys
m = runpy.run_path(sys.argv[1])
text = open('CHANGELOG.md').read()
assert m['body'](text, 'Unreleased') == '### Added\n- A newer concurrent note.'
assert 'A line written by a person' in m['body'](text, '0.1.2')
assert 'a thing' in m['body'](text, '0.1.2')
assert 'compare/v0.1.2...HEAD' in text and 'compare/v0.1.0...v0.1.2' in text
# Multiline notes, repeated categories and duplicate entries retain their counts.
snapshot = '# Changelog\n\n## [Unreleased]\n\n### Added\n- One\n  detail\n\n### Fixed\n- Same\n'
current = snapshot.replace('### Fixed', '### Added\n- New\n\n### Fixed').replace('- Same', '- Same\n- Same')
archived = m['archive'](current, snapshot, '1.0.0', 'https://example.test', '2026-10-23')
assert m['body'](archived, 'Unreleased') == '### Added\n- New\n\n### Fixed\n- Same'
assert m['archive'](archived, snapshot, '1.0.0', 'https://example.test', '2026-10-23') == archived
edited = snapshot.replace('- One', '- One, clarified')
assert 'One, clarified' in m['body'](m['archive'](edited, snapshot, '1.0.0', 'https://example.test', '2026-10-23'), 'Unreleased')
END
before=$(git -C "$tmp/origin.git" rev-parse develop)
PATH="$tmp/bin:$PATH" TEST_PUBLISHED=yes GH_REPO=owner/zinc GITHUB_SHA="$sha" TAG=v0.1.2 bash "$archive" > "$tmp/archive.out" 2>&1 || { cat "$tmp/archive.out"; fail=1; }
[ "$(git -C "$tmp/origin.git" rev-parse develop)" = "$before" ] || { echo "rerun consumed concurrent notes or created another commit"; fail=1; }
run --undo v0.1.2 --yes >/dev/null; git tag -l v0.1.2 | grep -q . && { echo "--undo kept the tag"; fail=1; }
run --bump nonsense --yes --dry-run | grep -q "not a version" || { echo "a wrong version is not refused"; fail=1; }
[ $fail -eq 0 ] && echo "release_tool: ok"
exit $fail
