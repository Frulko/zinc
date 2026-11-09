// No any/unknown, explicit union annotation, assertion import or JSON to incidentally load Dyn helpers.
console.log([1, 2].flatMap(n => n === 1 ? 'a' : [n]).join(','));
