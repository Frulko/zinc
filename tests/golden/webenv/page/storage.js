// localStorage and sessionStorage as properties, the way small games keep a best score: `localStorage.best = 3`, a read by name, `in`,
// `delete`, Object.keys and JSON.stringify, next to the methods; a name the Storage has (getItem, length) stays its member.
localStorage.clear();
localStorage.best = 3;
localStorage['player name'] = 'Ada';
localStorage.setItem('level', 7);
console.log('read', localStorage.best, typeof localStorage.best, localStorage.getItem('best'), localStorage['player name'], localStorage.level, localStorage.nothing, localStorage.getItem('nothing'));
console.log('keys', Object.keys(localStorage).join(','), localStorage.length, 'best' in localStorage, 'nothing' in localStorage, JSON.stringify(localStorage));
delete localStorage.best;
console.log('deleted', localStorage.getItem('best'), localStorage.length, Object.keys(localStorage).join(','));
localStorage.setItem('getItem', 'x');
console.log('member', typeof localStorage.getItem, localStorage.getItem('getItem'), typeof localStorage.length, localStorage instanceof Storage, localStorage.length, Object.keys(localStorage).sort().join(','));   // (a browser's order of keys is its own)
const copy = { ...localStorage };
console.log('spread', JSON.stringify(copy));
sessionStorage.turn = 2;
console.log('session', sessionStorage.turn, sessionStorage.length, Object.keys(sessionStorage).join(','));
