const group = { codecs: ['vp8', 'opus'], 'max-clients': 25, autokick: false };
console.log(JSON.stringify(group));
const escaped = {
  'a-b': 0, a_b: 1, '': false, 'quo"te': 'a "value"', "apo'strophe": '\\',
  'back\\slash': 2, 'line\nbreak': 3, 'tab\tkey': 4, 'control\u0001': 5,
  'caf\u00e9': [{ 'nested-key': [false, true] }], 'emoji\u{1f600}': [[0, 1], [2]],
  regular: null as string | null, ignored: (): number => 7,
};
console.log(JSON.stringify(escaped));
if (escaped['a-b'] !== 0 || escaped.a_b !== 1 || escaped['quo"te'] !== 'a "value"' || escaped['café'].length !== 1) throw new Error('quoted lookup');
escaped['a-b'] = 6;
console.log(escaped['a-b'], escaped.a_b);
interface Optional { 'child-list': number[]; 'missing-key'?: string; 'a\\b'?: number; }
const optional: Optional = { 'child-list': [0, 2], 'a\\b': 0 };
console.log(JSON.stringify(optional));
const hidden: unknown = escaped;
console.log(JSON.stringify(hidden));
class Base { 'base-key': number = 0; }
class Child extends Base { 'quote"key': boolean = false; }
console.log(JSON.stringify(new Child()));
console.log(JSON.stringify(['quote"', '\\', '\n', 'é😀']));
