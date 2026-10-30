// One text with a run in the style of RUN_STYLE (0 plain, 8 underline, 16 strike): tests/t0/ui_run_strike.sh compares the frames.
import * as ui from 'zinc:ui';
import { env } from 'zinc:sys';
const root = ui.createNode(ui.VIEW); ui.setClass(root, 'p-3 bg-white');
const t = ui.createNode(ui.TEXT); ui.setClass(t, 'text-base text-slate-900'); ui.setText(t, 'keep gone keep');
ui.setTextRuns(t, [5, 0, -1, 4, parseInt(env('RUN_STYLE')), 0xdc2626, 5, 0, -1]);
ui.insert(root, t, -1);
ui.mount(root, 0xffffff, null);
