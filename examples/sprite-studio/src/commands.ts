// What a command of the tools window does to the canvas's state.
import * as st from './state';
import { parseColor } from './sprite';
import { TOOLS } from './constants';
import type { ToolsCommand } from './protocol';

export function applyToolsCommand(c: ToolsCommand): void {
  const k = c.kind;
  if (k === 'tool') { if (TOOLS.indexOf(c.text) >= 0) st.setTool(c.text); }
  else if (k === 'color') st.setColorIndex(c.value);
  else if (k === 'edit-color') {
    const color = parseColor(c.text);
    if (color < 0) st.setNotice(`'${c.text}' is not a #rrggbb colour`); else st.editColor(c.value, color);
  }
  else if (k === 'brush') st.setBrush(c.value);
  else if (k === 'frame') st.selectFrame(c.value);
  else if (k === 'add-frame') st.addFrame();
  else if (k === 'duplicate-frame') st.duplicateFrame();
  else if (k === 'delete-frame') st.deleteFrame();
  else if (k === 'onion') st.toggleOnion();
  else if (k === 'play') st.togglePlaying();
  else if (k === 'fps') st.nextFps();
  else if (k === 'undo') st.undo();
  else if (k === 'redo') st.redo();
  console.log(`canvas: ${k}${c.text !== '' ? ' ' + c.text : ''}${k === 'color' || k === 'brush' || k === 'frame' || k === 'edit-color' ? ' ' + c.value : ''}`);
}
