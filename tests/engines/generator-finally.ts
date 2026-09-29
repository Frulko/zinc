function* cleanup(): Generator<number> { try { yield 1; return 7; } finally { console.log('cleanup'); yield 2; console.log('finished'); } }
const normal = cleanup(); console.log(normal.next(),normal.next(),normal.next());
const closed = cleanup(); console.log(closed.next(),closed.return(9),closed.next());
const thrown = cleanup(); console.log(thrown.next(),thrown.throw(new Error('pending'))); try { thrown.next(); } catch(e) { console.log('error',e.message); }
function* override(): Generator<number> { try { yield 1; } finally { yield 2; return 33; } }
const overridden = override(); console.log(overridden.next(),overridden.return(11),overridden.next());
function* loop(): Generator<number> { for(let i=0;i<3;i++){ try { yield i; } finally { yield i+10; if(i===1)break; } } return 99; }
const l=loop(); for(const n of l) console.log('loop',n);
function failCleanup(): void { throw new Error('cleanup call'); }
function* callError(): Generator<number> { try { failCleanup(); } finally { yield 70; } }
const ce=callError(); console.log('call',ce.next()); try{ce.next();}catch(e){console.log('call error',e.message);}
function* nest(): Generator<number> { try { try { yield 1; } finally { yield 2; } } finally { yield 3; } }
const nested=nest(); console.log('nested',nested.next(),nested.return(88),nested.next(),nested.next());
function* control(): Generator<number> { let i=0; do { i++; try { yield i; } finally { yield i+20; continue; } } while(i<2); for(const j of [4,5]){try {yield j;} finally {yield j+20;break;}} }
for(const n of control())console.log('control',n);
function* delegateClose(): Generator<number> { const last = yield* cleanup(); console.log('delegate terminal',last); return 100; }
const dc=delegateClose(); console.log('delegate close',dc.next(),dc.return(51),dc.next());
function* plainChild(): Generator<number> { yield 1; return 2; }
function* plainParent(): Generator<number> { yield* plainChild(); console.log('must not run'); }
const pc=plainParent(); pc.next(); console.log('plain return',pc.return(77));
function* noReturn(): Generator<number> { try { yield 1; } finally { yield 2; return; } }
const nr=noReturn(); nr.next(); console.log('undefined override',nr.return(77),nr.next());
