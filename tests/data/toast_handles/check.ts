import { createSignal, createEffect, createSubtree } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { toast, clearToasts, ToastHandle } from 'zinc:ui/kit';
import { addToast, toastCount, clearToasts as clearNuxt } from 'zinc:ui/nuxt';
import { equal, ok } from 'zinc:assert';
function find(h: i32, text: string): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (n.text === text) return h;
  for (const child of n.children) { const found = find(child, text); if (found >= 0) return found; }
  return -1;
}
function floating(text: string): i32 {
  const layers = ui.domLayers();
  for (let i = 0; i < layers.length; i += 4) { const found = find(layers[i], text); if (found >= 0) return found; }
  return -1;
}
function progressValue(h: i32): string {
  const n = ui.inspectNode(h); if (n === null || n.hidden) return '';
  if (n.role === 'progressbar') return n.attrV[n.attrK.indexOf('aria-valuenow')];
  for (const child of n.children) { const value = progressValue(child); if (value !== '') return value; }
  return '';
}
function toastCard(title: string): i32 {
  let h = floating(title);
  while (h >= 0) { const n = ui.inspectNode(h); if (n === null) break; if (n.role === 'status' || n.role === 'alert') return h; h = n.parent; }
  return -1;
}
function toastProgress(title: string): string { return progressValue(toastCard(title)); }
function links(h: i32): void {
  const n = ui.inspectNode(h); ok(n !== null, 'no stale child in toast');
  if (n === null) return;
  const seen: i32[] = [];
  for (const child of n.children) { ok(seen.indexOf(child) < 0, 'no duplicate child'); seen.push(child); equal(ui.parentOf(child), h, 'toast child belongs to its parent'); links(child); }
}
function layerLinks(): void { const layers = ui.domLayers(); for (let i = 0; i < layers.length; i += 4) links(layers[i]); }
function activate(text: string): void {
  let node = floating(text);
  for (;;) { const n = ui.inspectNode(node); if (n === null) throw new Error('missing action '+text); if (n.focusable) break; node = n.parent; }
  ui.click(node);
}
export function checkToastHandles(): void {
  clearToasts(); clearNuxt(); ui.pointerAt(0, 0, false); ui.focusNode(-1);
  let old = 0, current = 0, dismissed = 0;
  const h = toast('Before', 'body', -1, { action: 'Old', onAction: () => old++, onDismiss: () => dismissed++ });
  const layers = ui.domLayers(), card = toastCard('Before'), serial = ui.nodeSerial(card);
  h.update({ title: 'After', description: '', progress: 250, actions: [{ label: 'New', onAction: () => current++ }] });
  equal(ui.nodeSerial(card), serial, 'same card'); equal(toastProgress('After'), '100', 'clamped accessible live progress'); ok(floating('Before') < 0, 'old title removed'); ok(floating('After') >= 0, 'new title visible'); ok(floating('Old') < 0, 'old action removed');
  h.update({ actions: [] }); ok(floating('New') < 0, 'actions cleared');
  h.update({ actions: [{ label: 'New', onAction: () => current++ }] }); activate('New');
  equal(old, 0, 'old callback'); equal(current, 1, 'replacement keyboard callback'); equal(dismissed, 1, 'dismiss callback'); layerLinks(); h.close(); h.update({ title: 'Stale' }); ok(floating('Stale') < 0, 'closed handle refused');
  const [revision, setRevision] = createSignal(0);
  let owned: ToastHandle | null = null;
  const scope = createSubtree(() => {
    createEffect(() => {
      const v = revision();
      if (owned === null) owned = toast('Owned before', '', -1, { action: 'Owned action', onAction: () => current++ });
      else (owned as ToastHandle).update({ title: `Owned ${v}` });
    });
    return ui.createNode(ui.FRAGMENT);
  });
  setRevision(1); ok(floating('Owned action') >= 0, 'imperative action outlives creating effect rerun');
  activate('Owned action'); equal(current, 2, 'owned replacement action'); scope.dispose(); ui.destroy(scope.node);
  let cancelledExpiry = 0;
  toast('First due', '', 20, { onDismiss: clearToasts });
  toast('Second due', '', 20, { onDismiss: () => cancelledExpiry++ });
  ui.focusNode(-1); ui.tick(21); equal(cancelledExpiry, 0, 'due callback cancelled by another expiry');
  const timed = toast('Deadline', '', 100); ui.tick(40); timed.update({ progress: 20 }); ui.tick(61); ok(floating('Deadline') < 0, 'progress retains deadline');
  const n = addToast({ title: 'Nuxt before', progress: true, duration: 100, actions: ['Old'], onAction: () => old++ });
  ui.tick(40); n.update({ title: 'Nuxt after', value: 45, actions: ['Replacement'], onAction: () => current++ });
  ok(floating('Nuxt after') >= 0, 'Nuxt updated title'); equal(toastProgress('Nuxt after'), '45', 'Nuxt live progress'); n.update({ actions: [] }); ok(floating('Replacement') < 0, 'Nuxt cleared actions');
  n.update({ actions: ['Replacement'] }); activate('Replacement'); equal(old, 0); equal(current, 3, 'nuxt replacement callback'); equal(toastCount(), 0);
  const expiry = addToast({ title: 'Nuxt deadline', duration: 100 }); ui.focusNode(-1); ui.tick(40); expiry.update({ value: -5 }); ui.tick(61); equal(toastCount(), 0);
  const stale = addToast({ title: 'Evicted', duration: -1 }); for (let i = 0; i < 5; i++) addToast({ title: 'Live', duration: -1 });
  equal(toastCount(), 5); layerLinks(); stale.update({ title: 'Stale Nuxt' }); ok(floating('Stale Nuxt') < 0, 'Nuxt evicted stale handle'); clearNuxt(); stale.close(); equal(toastCount(), 0);
  const dead = toast('Destroyed', '', -1); const oldLayer = ui.parentOf(toastCard('Destroyed')); ui.destroy(oldLayer);
  const replacement = toast('Replacement', '', -1); dead.update({ title: 'Wrong owner' }); ok(floating('Wrong owner') < 0, 'destroyed layer stale handle'); ok(floating('Replacement') >= 0, 'replacement layer visible');
  clearToasts(); replacement.close(); ui.tick(1000); equal(dismissed, 1);
}

let keyboardHits: i32 = 0;
function key(text: string): void {
  let node = floating(text);
  while (node >= 0) { const n = ui.inspectNode(node); if (n === null) break; if (n.focusable) { ui.focusNode(node); ui.keyDown(-1, 'Enter'); return; } node = n.parent; }
  throw new Error('missing keyboard action');
}
export function checkToastKeyboard(step: i32): void {
  if (step === 0) {
    const h = toast('Keyboard', '', -1, { action: 'Unused', onAction: () => keyboardHits += 100 });
    h.update({ actions: [{ label: 'Kit keyboard', onAction: () => keyboardHits++ }] }); key('Kit keyboard');
  } else if (step === 1) {
    ui.keyUp('Enter'); equal(keyboardHits, 1, 'kit replacement keyboard action');
    const h = addToast({ title: 'Keyboard', duration: -1, actions: ['Unused'], onAction: () => keyboardHits += 100 });
    h.update({ actions: ['Nuxt keyboard'], onAction: () => keyboardHits++ }); key('Nuxt keyboard');
  } else {
    ui.keyUp('Enter'); equal(keyboardHits, 2, 'nuxt replacement keyboard action'); clearToasts(); clearNuxt();
    const kit = toast('Old root kit', '', -1), nuxt = addToast({ title: 'Old root Nuxt', duration: -1 });
    ui.destroy(ui.rootNode()); ui.setRoot(ui.createNode(ui.VIEW));
    const fresh = toast('New root', '', -1);
    kit.update({ title: 'Stale kit root' }); nuxt.update({ title: 'Stale Nuxt root' });
    ok(floating('Stale kit root') < 0, 'kit root stale handle'); ok(floating('Stale Nuxt root') < 0, 'Nuxt root stale handle'); ok(floating('New root') >= 0, 'new root toast visible'); equal(toastCount(), 0);
    fresh.close(); ui.tick(1000);
    console.log('toast handles keyboard: ok');
  }
}
