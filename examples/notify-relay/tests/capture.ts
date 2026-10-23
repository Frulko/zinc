// Reused SQLite polling across batches, including binary identity images and a clock correction.
import { Capture } from '../src/capture';
import { Database } from 'zinc:sqlite';
import { Blob } from 'zinc:web';
import { readBytes } from 'zinc:fs';
import { env } from 'zinc:sys';

const root = env('RELAY_CAPTURE_FIXTURE');
if (root === '') throw new Error('RELAY_CAPTURE_FIXTURE is required');
const writer = new Database(root + '/db');
const capture = new Capture(root + '/db');
const plain = Blob.fromBytes(readBytes(root + '/plain.plist'));
const image = Blob.fromBytes(readBytes(root + '/image.plist'));
const insert = writer.prepare('INSERT INTO record(app_id,uuid,data,delivered_date,presented) VALUES(1,?,?,?,1)');
function check(ok: boolean, why: string): void { if (!ok) throw new Error(why); }
function add(id: i32, data: Blob, at: number): void {
  const uuid: u8[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, id as u8];
  insert.run([Blob.fromBytes(uuid), data, at]);
}

check(capture.poll().length === 0, 'history must be skipped');
for (let i: i32 = 1; i <= 5; i++) add(i, plain, 800000000.5);
check(capture.poll().length === 5, 'first batch must be delivered');
check(capture.poll().length === 0, 'same-date rows must not repeat');
add(6, image, 800000000.5);
for (let i: i32 = 7; i <= 10; i++) add(i, plain, 800000000.5);
const second = capture.poll();
check(second.length === 5, 'later rows with the same date must be delivered');
check(second[0].kind === 'message' && second[0].avatars.length === 1, 'binary identity image must survive polling');
check(capture.poll().length === 0, 'second batch must not repeat');
add(11, plain, 799999000.5);
check(capture.poll().length === 1, 'new row after a clock correction must be delivered');
check(capture.poll().length === 0, 'clock-corrected row must not repeat');
insert.finalize();
writer.close();
console.log('capture batches: PASS');
