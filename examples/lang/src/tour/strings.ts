// Strings: stored as UTF-8, indexed like JavaScript (UTF-16 code units), with the usual methods.
import { section } from '../report';

export function strings(): void {
  section('Strings');
  const padded = '  Hello, Zinc world  ';
  const text = padded.trim();
  console.log(text.length, text.toUpperCase(), text.slice(-5), text.indexOf('Zinc'), text.split(' ').length);
  console.log('ab'.repeat(3), '7'.padStart(3, '0'), text.replaceAll('l', 'L'));

  // 'é€' is 2 code units; slicing 'naïve' works on characters, not bytes
  console.log('é€'.length, 'naïve'.slice(2, 4));

  // parsing and number to string
  console.log(parseInt('42px'), parseFloat('3.5e2'), (1234.5678).toFixed(2), String.fromCharCode(90));
}
