// Intl.Segmenter fixtures (ZN-165): the same program runs under Node (ICU) and `zinc run --engine quickjs`; the outputs must be equal.
const texts = {
  latin: 'Hello, world! It\'s 3.14 o\'clock.',
  zwj: 'a👨‍👩‍👧‍👦b👩🏽‍💻c',
  flags: '🇫🇷🇩🇪x🇺🇸',
  combining: 'éạ̈ño',
  hangul: '한국어 한',
  cjk: '日本語のテキスト、漢字。',
  thai: 'สวัสดีครับ',
  indic: 'क्षत्रिय हिन्दी',
  crlf: 'a\r\nb\nc',
  emoji: '👍🏻 ok ❤️ ✌',
};
const out = [];
for (const g of ['grapheme', 'word']) {
  for (const k of Object.keys(texts)) {
    if (g === 'word' && (k === 'cjk' || k === 'thai')) continue;   // ICU breaks these words with a dictionary, libunibreak follows UAX #29 only
    const segs = [...new Intl.Segmenter('en', { granularity: g }).segment(texts[k])].map(s => s.segment + (g === 'word' ? (s.isWordLike ? '+' : '-') : '') + '@' + s.index);
    out.push(g + ' ' + k + ': ' + segs.join('|'));
  }
}
const s = new Intl.Segmenter('en').segment('a👍b');
out.push('containing ' + JSON.stringify(s.containing(2)) + ' ' + JSON.stringify(s.containing(9)));
console.log(out.join('\n'));
