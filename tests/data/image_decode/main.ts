import { onFrame, clear, drawImage, imageFromBytes, startImageDecode, pollImageDecode, cancelImageDecode, imageWidth, imageHeight, quit } from 'zinc:gfx';
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';

const png = fs.readBytes(env('ZN_PNG'));
const jpg = fs.readBytes(env('ZN_JPG'));
const corrupt: u8[] = [];
for (let i = 0; i < 60; i++) corrupt.push(png[i]);   // a PNG cut after its header

const hPng = startImageDecode(png);
const hJpg = startImageDecode(jpg);
const hBad = startImageDecode(corrupt);
const hCancelled = startImageDecode(png);
cancelImageDecode(hCancelled);
const handles: i32[] = [hPng, hJpg, hBad];
for (let i = 0; i < 40; i++) handles.push(startImageDecode(i % 2 === 0 ? png : jpg));   // many in flight
handles.push(startImageDecode(png, 50));   // shrunk: 200 x 200 to 50 x 50
handles.push(startImageDecode(jpg, 16));   // shrunk, proportions kept
handles.push(startImageDecode(png, 500));  // already smaller: untouched
const results: i32[] = [];
for (let i = 0; i < handles.length; i++) results.push(-2);
const syncPng = imageFromBytes(png);
const syncJpg = imageFromBytes(jpg);
let stage = 0;
let spins = 0;
onFrame((dt: number) => {
  clear(0x203040);
  if (stage === 0) {
    let pending = 0;
    for (let i = 0; i < handles.length; i++) {
      if (results[i] === -2) results[i] = pollImageDecode(handles[i]);
      if (results[i] === -2) pending++;
    }
    spins++;
    if (pending > 0 && spins < 300000) return;
    let ok = 0;
    for (let i = 3; i < results.length - 3; i++) {
      const want = i % 2 === 1 ? syncPng : syncJpg;   // the many alternate png (even index of the loop = odd here), jpg
      if (results[i] >= 0 && imageWidth(results[i]) === imageWidth(want) && imageHeight(results[i]) === imageHeight(want)) ok++;
    }
    console.log(`png ${imageWidth(results[0])}x${imageHeight(results[0])} jpg ${imageWidth(results[1])}x${imageHeight(results[1])} bad ${results[2]} many ok ${ok}/${results.length - 6}`);
    const s = results.length - 3;
    console.log(`shrunk ${imageWidth(results[s])}x${imageHeight(results[s])} ${imageWidth(results[s + 1])}x${imageHeight(results[s + 1])} ${imageWidth(results[s + 2])}x${imageHeight(results[s + 2])}`);
    console.log(`spent handle ${pollImageDecode(hPng)} cancelled handle ${pollImageDecode(hCancelled)} unknown handle ${pollImageDecode(987654)}`);
    stage = 1;
  }
  drawImage(syncPng, 0, 0, 100, 100, 255, 0);
  drawImage(results[0], 100, 0, 100, 100, 255, 0);
  drawImage(syncJpg, 0, 100, 100, 100, 255, 0);
  drawImage(results[1], 100, 100, 100, 100, 255, 0);
  if (stage++ > 2) quit();
});
