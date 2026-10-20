// Files, images and folders given to a turn (src/services/attach.ts): their references in the message field, the `@` completion,
// and how each CLI gets them (the arguments the real CLIs were checked with, in the header of attach.ts).
import * as assert from 'zinc:assert';
import * as fs from 'zinc:fs';
import { Attachment, A_IMAGE, A_FILE, A_FOLDER, kindOf, attachmentOf, relative, mention, token, withoutToken, imagesAsMentions,
  filesUnder, typedMention, complete } from '../src/services/attach';
import { AGENTS, TurnSettings, MODE_READ } from '../src/services/agents';

const dir = fs.mkdtemp(fs.tmpdir() + '/agents-attach-');
fs.mkdir(dir + '/src/deep', true);
fs.mkdir(dir + '/node_modules/x', true);
fs.mkdir(dir + '/.git', true);
fs.writeText(dir + '/src/word.ts', 'x');
fs.writeText(dir + '/src/deep/words.md', 'x');
fs.writeText(dir + '/shot.PNG', 'x');
fs.writeText(dir + '/node_modules/x/index.js', 'x');

// what a dropped path is, and its reference
assert.equal(kindOf('/a/b.png', false), A_IMAGE);
assert.equal(kindOf('/a/b.JPEG', false), A_IMAGE);
assert.equal(kindOf('/a.png/readme', false), A_FILE, 'the extension is the file name\'s');
assert.equal(kindOf('/a/b.png', true), A_FOLDER);
const img = attachmentOf(dir + '/shot.PNG', 2);
assert.equal(img.kind, A_IMAGE);
assert.equal(img.n, 3, 'numbered after the images already given');
const folder = attachmentOf(dir + '/src/', 0);
assert.equal(folder.kind, A_FOLDER);
assert.equal(folder.path, dir + '/src', 'without its trailing slash');
assert.equal(relative(dir + '/src/word.ts', dir), 'src/word.ts');
assert.equal(relative(dir + '/src/word.ts', dir + '/'), 'src/word.ts');
assert.equal(relative('/elsewhere/x.ts', dir), '/elsewhere/x.ts', 'outside the folder: absolute');
assert.equal(relative(dir + 'more/x.ts', dir), dir + 'more/x.ts', 'a folder whose name starts like it is not inside');
assert.equal(mention('my dir/a b.ts'), '@"my dir/a b.ts"');
assert.equal(token(img, dir), '[Image #3]');
assert.equal(token(folder, dir), '@src/');
assert.equal(token(new Attachment(dir + '/src/word.ts', A_FILE, 0), dir), '@src/word.ts');

// a chip's × takes its reference away, only where it stands as a word
assert.equal(withoutToken('@src/ @src/word.ts look', '@src/'), '@src/word.ts look');
assert.equal(withoutToken('see @src/word.ts and @src/', '@src/'), 'see @src/word.ts and ');
assert.equal(withoutToken('[Image #1] [Image #10] x', '[Image #1]'), '[Image #10] x');

// Claude reads images through @path in its prompt; the [Image #n] the field shows becomes that
const atts = [new Attachment(dir + '/shot.PNG', A_IMAGE, 1), new Attachment(dir + '/src/word.ts', A_FILE, 0), new Attachment(dir + '/src', A_FOLDER, 0)];
assert.equal(imagesAsMentions('what is [Image #1] and @src/word.ts', atts, dir), 'what is @shot.PNG and @src/word.ts');
assert.equal(imagesAsMentions('no reference left', atts, dir), 'no reference left @shot.PNG', 'an image whose reference was erased still goes');

const s = new TurnSettings(MODE_READ, '', '', false);
const prompt = '[Image #1] @src/word.ts @src/ explain';
const claude = AGENTS[0].args(prompt, '', s, atts, dir);
assert.equal(claude[0], '-p');
assert.equal(claude[1], '@shot.PNG @src/word.ts @src/ explain');
// Codex: images with -i (on exec and on exec resume), the prompt after --, files and folders as @path in it
const codex = AGENTS[1].args(prompt, 'sess', s, atts, dir);
assert.deepEqual(codex.slice(codex.indexOf('resume')), ['resume', 'sess', '-i', dir + '/shot.PNG', '--', prompt]);
assert.deepEqual(AGENTS[1].args('-x', '', s, [], dir).slice(-2), ['--', '-x'], 'a prompt like an option stays the prompt');
// opencode: images and files with -f, folders as @path in the prompt
const open = AGENTS[2].args(prompt, '', s, atts, dir);
assert.deepEqual(open.slice(open.length - 5), ['-f', dir + '/shot.PNG', '-f', dir + '/src/word.ts', prompt]);

// the @ completion: the folder's paths (no hidden, no dependency folders), the name's start first
const index = filesUnder(dir, 100);
assert.deepEqual(index, ['shot.PNG', 'src/', 'src/deep/', 'src/word.ts', 'src/deep/words.md']);
assert.deepEqual(filesUnder(dir, 2), ['shot.PNG', 'src/']);
assert.equal(typedMention('look at @wo'), 'wo');
assert.equal(typedMention('@'), '');
assert.equal(typedMention('mail me@host'), null, 'an @ inside a word');
assert.equal(typedMention('@src/word.ts done'), null, 'a reference already finished');
assert.deepEqual(complete(index, 'wo', 8), ['src/word.ts', 'src/deep/words.md']);
assert.deepEqual(complete(index, 'deep', 8), ['src/deep/', 'src/deep/words.md']);
assert.deepEqual(complete(index, 'S', 1), ['shot.PNG'], 'case-insensitive, at most max');

fs.remove(dir, true);
