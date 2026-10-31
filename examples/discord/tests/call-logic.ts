// The call's decisions that a real Discord call proved wrong (docs/reports/discord-video-fix-2026-10-31.md), without a network: which
// voice gateway close codes resume, identify again or end the call, which simulcast layer is decoded for a tile, and the order of
// STREAM_CREATE and STREAM_SERVER_UPDATE (either one first connects once both arrived; a null endpoint drops the connection). Prints
// "ok" or the first check that failed; tests/t0/discord_call_logic.sh.
import { closeAction, pickLayer, Layer } from 'zinc:discord-voice';
import { Live, streamStep } from '../src/call';

let failed = '';
function check(name: string, ok: boolean): void { if (!ok && failed === '') failed = name; }

// close codes (docs.discord.food, Voice Close Event Codes)
check('1006 resumes', closeAction(1006) === 'resume');
check('4015 resumes', closeAction(4015) === 'resume');
check('4013 resumes', closeAction(4013) === 'resume');
check('4006 identifies', closeAction(4006) === 'identify');
check('4009 identifies', closeAction(4009) === 'identify');
for (const c of [4001, 4002, 4003, 4004, 4005, 4011, 4012, 4014, 4016, 4017, 4020, 4021, 4022]) check(`${c} ends`, closeAction(c) === 'end');

// simulcast layers, best first: a small tile takes the quality-50 layer, a big one the full layer, a single layer is always taken
const two: Layer[] = [{ ssrc: 10, rtx: 11, quality: 100 }, { ssrc: 20, rtx: 21, quality: 50 }];
check('small tile, low layer', pickLayer(two, 50)!.ssrc === 20);
check('big tile, full layer', pickLayer(two, 100)!.ssrc === 10);
const one: Layer[] = [{ ssrc: 30, rtx: 31, quality: 100 }];
check('one layer for a small tile', pickLayer(one, 50)!.ssrc === 30);
check('no layer', pickLayer([], 100) === null);

// stream events in both orders
const create = { stream_key: 'guild:1:2:3', rtc_server_id: '555' }, update = { stream_key: 'guild:1:2:3', endpoint: 'x.discord.media:443', token: 't' };
const a = new Live();
check('create first: nothing yet', streamStep(a, 'STREAM_CREATE', create) === 'none');
check('create first: update connects', streamStep(a, 'STREAM_SERVER_UPDATE', update) === 'connect');
check('create first: the server kept', a.endpoint === 'x.discord.media:443' && a.rtc === '555');
const b = new Live();
check('update first: nothing yet', streamStep(b, 'STREAM_SERVER_UPDATE', update) === 'none');
check('update first: create connects', streamStep(b, 'STREAM_CREATE', create) === 'connect');
check('a moved server connects again', streamStep(b, 'STREAM_SERVER_UPDATE', { stream_key: 'k', endpoint: 'y.discord.media:443', token: 'u' }) === 'connect' && b.endpoint === 'y.discord.media:443');
check('a null endpoint drops', streamStep(b, 'STREAM_SERVER_UPDATE', { stream_key: 'k', endpoint: null, token: null }) === 'drop' && b.endpoint === '');
check('and the next update connects', streamStep(b, 'STREAM_SERVER_UPDATE', update) === 'connect');

console.log(failed === '' ? 'ok' : `FAIL ${failed}`);
