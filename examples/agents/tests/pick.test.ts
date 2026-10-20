// The model picker's search: case and accents aside, anywhere in the id, label or provider, every word typed; the kept
// choices grouped by provider, and the keys' moves over them.
import * as assert from 'zinc:assert';
import { fold, Pickable, filter, rows, step, Row } from '../src/services/pick';

assert.equal(fold('Évaluer GPT-Ünïcode'), 'evaluer gpt-unicode');
assert.equal(fold('Straße'), 'strasse');

const items = [
  new Pickable('', 'Default', ''),
  new Pickable('opencode-go/glm-5.3-flash', 'GLM-5.3 Flash', 'OpenCode Go'),
  new Pickable('opencode/big-pickle', 'Big Pickle', 'Default / OpenCode'),
  new Pickable('opencode-go/kimi-k3', 'Kimi K3', 'OpenCode Go'),
  new Pickable('lmstudio/qwen', 'Qwen Café', 'LM Studio (local)'),
];
const ids = (q: string): string => filter(items, q).join(',');
assert.equal(ids(''), '0,1,2,3,4', 'an empty query keeps them all');
assert.equal(ids('GLM'), '1', 'case aside');
assert.equal(ids('cafe'), '4', 'accents aside, in the label');
assert.equal(ids('CAFÉ'), '4');
assert.equal(ids('pickle'), '2', 'anywhere in the id');
assert.equal(ids('go k3'), '3', 'every word, in any field');
assert.equal(ids('  go   glm '), '1', 'extra spaces');
assert.equal(ids('studio'), '4', 'in the provider');
assert.equal(ids('nothing'), '');

// grouped: the default first, then each provider under its heading, in the order they first come
const all = rows(items, filter(items, ''));
const text = (l: Row[]): string => l.map((r: Row) => r.index < 0 ? `[${r.heading}]` : '' + r.index).join(' ');
assert.equal(text(all), '0 [OpenCode Go] 1 3 [Default / OpenCode] 2 [LM Studio (local)] 4');
assert.equal(text(rows(items, filter(items, 'go'))), '1 3', 'one provider left: no heading');
const single = [new Pickable('', 'Default', ''), new Pickable('opus', 'Opus', ''), new Pickable('sonnet', 'Sonnet', '')];
assert.equal(text(rows(single, filter(single, ''))), '0 1 2', 'a CLI with one provider has no headings');

// the keys skip headings and wrap
assert.equal(step(all, 0, 1), 2, 'down over the heading');
assert.equal(step(all, 2, 1), 3);
assert.equal(step(all, 3, 1), 5);
assert.equal(step(all, 7, 1), 0, 'wraps to the top');
assert.equal(step(all, 0, -1), 7, 'up wraps to the bottom');
assert.equal(step(all, -1, 1), 0, 'the first choice');
assert.equal(step([], -1, 1), -1, 'none when nothing is kept');
assert.equal(step([new Row('Go', -1)], -1, 1), -1);
