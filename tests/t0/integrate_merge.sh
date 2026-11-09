#!/bin/sh
# Real cherry-pick and stash conflicts keep both additions, never a diff3 base.
cd "$(dirname "$0")/../.." || exit 2
python3 -I - "$PWD/tools/integrate" <<'PY'
from pathlib import Path
import json
import shutil
import subprocess
import sys
import tempfile

tool = Path(sys.argv[1])
for style in ['merge', 'diff3', 'zdiff3']:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / 'tools').mkdir()
        shutil.copy2(tool, root / 'tools/integrate')
        def git(*args):
            return subprocess.run(['git', *args], cwd=root, check=True, capture_output=True, text=True).stdout
        git('init', '-q', '-b', 'develop')
        git('config', 'user.name', 'Test')
        git('config', 'user.email', 'test@invalid')
        git('config', 'merge.conflictstyle', style)
        log, affected = root / 'CHANGELOG.md', root / 'tests/affected.json'
        affected.parent.mkdir()
        def write(who, owner=False):
            log.write_text('## Changes\n- ' + who + '\n' + ('- owner\n' if owner else ''))
            rows = [who] + (['owner'] if owner else []) + ['sentinel']
            affected.write_text('{"map":[\n' + ',\n'.join(json.dumps({'paths': [name], 'tests': []}) for name in rows) + '\n]}\n')
        write('base')
        git('add', 'CHANGELOG.md', 'tests/affected.json')
        git('commit', '-qm', 'test: base')
        git('switch', '-qc', 'work/fixture')
        write('worker')
        git('commit', '-qam', 'test: worker')
        git('switch', '-q', 'develop')
        write('develop')
        git('commit', '-qam', 'test: develop')
        write('develop', owner=True)
        result = subprocess.run([str(root / 'tools/integrate'), 'work/fixture'], cwd=root, capture_output=True, text=True)
        assert result.returncode == 0, (style, result.stdout, result.stderr)
        text = log.read_text()
        assert all(text.count('- ' + name + '\n') == 1 for name in ['develop', 'worker', 'owner']), (style, text)
        assert not any(mark in text for mark in ['<<<<<<<', '|||||||', '>>>>>>>', '- base']), (style, text)
        rows = [row['paths'][0] for row in json.loads(affected.read_text())['map']]
        assert sorted(rows) == ['develop', 'owner', 'sentinel', 'worker'], (style, rows)
        assert 'owner' not in git('show', 'HEAD:CHANGELOG.md')
        assert ' M CHANGELOG.md' in git('status', '--porcelain')
        assert not git('stash', 'list').strip()
print('integrate_merge: both sides and owner WIP survive all three conflict styles')
PY
