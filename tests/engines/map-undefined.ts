const dictionary = new Map<string, string>();
dictionary.set('empty', '');
dictionary.set('value', 'yes');
console.log('missing', dictionary.get('missing') === undefined, dictionary.get('missing') !== undefined, undefined === dictionary.get('missing'));
console.log('present', dictionary.get('empty') === undefined, dictionary.get('empty') !== undefined, dictionary.get('value') !== undefined);

const missing = dictionary.get('missing');
const blank = dictionary.get('empty');
console.log('stored', missing === undefined, missing !== undefined, blank === undefined, blank !== undefined);
