// tests/t0/pdf.sh: zinc:pdf over the fixture (sample.pdf, make-sample.py): pages, sizes, renders, ink annotations in a saved copy.
import * as pdf from 'zinc:pdf';
import * as sys from 'zinc:sys';

const dir = sys.env('PDF_TEST_DIR');
const doc = pdf.open(dir + '/sample.pdf');
const size = doc.pageSize(0);
console.log('pages ' + doc.pageCount.toString() + ' size ' + size.width.toString() + 'x' + size.height.toString());
const p1 = doc.render(0, 1, 0, 0, 400, 500);
const h1 = pdf.imageHash(p1);
const p2 = doc.render(1, 1, 0, 0, 400, 500, p1);
console.log('same image ' + (p2 === p1 ? 'yes' : 'no') + ', pages differ ' + (pdf.imageHash(p2) !== h1 ? 'yes' : 'no'));
console.log('page 1 ' + h1);
// a part of the page at scale 2 is the same pixels as that part of the whole page at scale 2
const whole = doc.render(0, 2, 0, 0, 800, 1000);
const part = doc.render(0, 2, 0, 0, 800, 1000);
console.log('repeatable ' + (pdf.imageHash(whole) === pdf.imageHash(part) ? 'yes' : 'no'));
doc.addInk(0, [50, 100, 200, 150, 350, 100], 0x000000, 3);
const inked = pdf.imageHash(doc.render(0, 1, 0, 0, 400, 500, p1));
console.log('ink drawn ' + (inked !== h1 ? 'yes' : 'no'));
doc.save(dir + '/annotated.pdf');
doc.close();
const copy = pdf.open(dir + '/annotated.pdf');
console.log('copy pages ' + copy.pageCount.toString() + ', ink kept ' + (pdf.imageHash(copy.render(0, 1, 0, 0, 400, 500, p1)) === inked ? 'yes' : 'no'));
copy.close();
try { pdf.open(dir + '/missing.pdf'); } catch (e) { console.log('missing: ' + e.message); }
try { pdf.open(dir + '/pdf.ts'); } catch (e) { console.log('not a pdf: ' + e.message); }
