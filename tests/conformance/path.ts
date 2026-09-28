// zinc:path (lib/std/path.ts): the same results as Node's path.posix for these cases (checked by running this file
// on Node with 'node:path').
import * as path from 'zinc:path';

const ps = ['', '.', '/', '//', 'a', '/a/b/', 'a/b/c.txt', '/a/b/c.tar.gz', '.bashrc', 'a/.b', 'a/b.', '../x/./y//z/..', '/../a', 'a/../..', './a/'];
for (const p of ps) {
  const q = path.parse(p);
  console.log(JSON.stringify(p), path.normalize(p), path.dirname(p), JSON.stringify(path.basename(p)), JSON.stringify(path.extname(p)), path.isAbsolute(p),
    JSON.stringify([q.root, q.dir, q.base, q.ext, q.name]), JSON.stringify(path.format(q)));
}
console.log(path.join('a', 'b', '../c', './d/'), path.join('/a/', '/b'), path.join('', ''), path.join('a', '', 'b'), path.basename('/a/b.txt', '.txt'), path.basename('.txt', '.txt'));
console.log(path.resolve('/a', 'b', '../c'), path.resolve('/a', '/b', 'c'), path.resolve('/') , path.resolve('x') === path.join(path.resolve(''), 'x'));
console.log(path.relative('/a/b/c', '/a/d'), path.relative('/a', '/a'), JSON.stringify(path.relative('/a/b', '/a/b/c/d')), path.relative('/', '/x'));
console.log(path.sep, path.delimiter);
