import * as path from 'zinc:path';
console.log('normalize', path.normalize('/a//b/../c/'), path.normalize('../../a/./b'));
console.log('join', path.join('a', 'b', '..', 'c'), path.joinAll(['a', '.', 'b']));
console.log('parts', path.dirname('/a/b.txt'), path.basename('/a/b.txt'), path.extname('/a/b.txt'));
