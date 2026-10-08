// The router (src/router.ts): pages open, unknown ones are ignored, back walks the history.
import * as assert from 'zinc:assert';
import { Router } from '../src/router';

const r = new Router();
assert.equal(r.current, 'Home');
assert.ok(r.go('Notes'));
assert.ok(!r.go('Notes'));          // already there
assert.ok(!r.go('Nowhere'));        // not a page
assert.ok(r.go('Settings'));
assert.ok(r.back());
assert.equal(r.current, 'Notes');
assert.ok(r.back());
assert.equal(r.current, 'Home');
assert.ok(!r.back());
console.log('router: ok');
