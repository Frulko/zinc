// `zinc test examples/testing/tests`: each test-*.ts is a program; it passes when it exits with 0.
import * as assert from 'zinc:assert';
import * as path from 'zinc:path';

assert.equal(path.join('a', 'b', '../c'), 'a/c');
assert.equal(path.extname('x.tar.gz'), '.gz');
assert.deepEqual(path.parse('/a/b.txt').name, 'b');
assert.throws(() => { new URL('not a url'); }, 'Invalid URL');
const u = new URL('https://example.com/a?b=1');
assert.equal(u.searchParams.get('b'), '1');
async function main(): Promise<void> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(''));
  assert.equal(d.length, 32);
  await assert.rejects(async (): Promise<void> => { await fetch('nope'); }, 'Failed to parse URL');
  console.log('path, URL, crypto, fetch: ok');
}
main();
