// Inferno compatibility (`import { Component, render, linkEvent } from 'inferno'`): Inferno apps run on Zinc's
// React engine (lib/std/react.ts) — class components with setState, lifecycle methods, keyed reconciliation.
import * as ui from 'zinc:ui';
export { Component, linkEvent, useState, useEffect, useMemo, useRef, VirtualList } from 'zinc:ui/react';

/** `render(<App />)`: the element is already built (and reactive); mounts it full screen (no DOM container). */
export function render(node: i32): void {
  const root = ui.createNode(ui.VIEW);
  ui.insert(root, node, -1);
  ui.mount(root, 0xffffff, null);
}
