// Real npm libraries on the web target (docs/targets/web-libraries.md). Each one is used the way its README starts; the page reads __libs back.
import { createStore as zustandStore } from 'zustand/vanilla';
import { atom, createStore as jotaiStore } from 'jotai/vanilla';
import { produce } from 'immer';
import { addDays, format } from 'date-fns';
import dayjs from 'dayjs';
import { chunk, debounce } from 'lodash-es';
import * as lodash from 'lodash-es';
import { z } from 'zod';
import { QueryClient } from '@tanstack/query-core';
import ky from 'ky';
import axios from 'axios';
import { marked } from 'marked';
import { Chart, registerables } from 'chart.js';
import * as THREE from 'three';

const out: Record<string, string> = {};
const DATA = 'data:application/json,' + encodeURIComponent('{"answer":42}');
async function t(name: string, fn: () => any) {
  try { out[name] = String(await fn()); } catch (e) { out[name] = 'FAIL ' + ((e as any)?.message ?? e); }
}
function inked(canvas: any): number {   // the share of pixels that are not the first one's
  const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
  const g = c.getContext('2d')!; g.drawImage(canvas, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 4; i < d.length; i += 4) if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2] || d[i + 3] !== d[3]) n++;
  return Math.round((n / (d.length / 4)) * 100) / 100;
}

async function main() {
  await t('zustand', () => { const s = zustandStore<any>((set) => ({ n: 1, inc: () => set((st: any) => ({ n: st.n + 1 })) })); s.getState().inc(); return s.getState().n; });
  await t('jotai', () => { const a = atom(2); const dbl = atom((get) => get(a) * 2); const s = jotaiStore(); s.set(a, 5); return s.get(dbl); });
  await t('immer', () => { const base = { a: { b: 1 }, c: 2 }; const next = produce(base, (d: any) => { d.a.b = 9; }); return next.a.b + ':' + base.a.b + ':' + (next.c === base.c); });
  await t('date-fns', () => format(addDays(new Date(2024, 2, 10), 1), 'yyyy-MM-dd'));
  await t('dayjs', () => dayjs('2024-03-10').add(1, 'day').format('YYYY-MM-DD'));
  await t('lodash-es', () => JSON.stringify(chunk([1, 2, 3, 4, 5], 2)) + ':' + typeof debounce);
  await t('lodash-es namespace', () => (lodash as any).sum([1, 2, 3]));
  await t('zod', () => { const s = z.object({ a: z.number() }); return s.parse({ a: 1 }).a + ':' + s.safeParse({ a: 'x' }).success; });
  await t('tanstack query-core', async () => { const q = new QueryClient(); const r: any = await q.fetchQuery({ queryKey: ['d'], queryFn: () => fetch(DATA).then((x) => x.json()) }); return r.answer; });
  await t('ky', async () => ((await ky.get(DATA).json()) as any).answer);
  await t('axios', async () => (await axios.get(DATA)).data.answer);
  await t('marked', () => marked.parse('# hi **there**'));
  await t('chart.js', () => {
    Chart.register(...registerables);
    const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 200;
    const c = new Chart(canvas, { type: 'bar', data: { labels: ['a', 'b', 'c'], datasets: [{ label: 'n', data: [3, 7, 5], backgroundColor: '#3366cc' }] }, options: { animation: false, responsive: false } });
    c.draw();
    return 'inked ' + inked(canvas);
  });
  await t('three.js', () => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 120;
    const r = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x202020);
    const cam = new THREE.PerspectiveCamera(60, 160 / 120, 0.1, 10); cam.position.z = 2;
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff8800 })));
    r.render(scene, cam);
    return 'inked ' + inked(canvas) + ' r' + THREE.REVISION;
  });
  (globalThis as any).__libs = JSON.stringify(out);
}
main();
