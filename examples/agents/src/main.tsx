// agents: a small ADE (agent development environment). It finds the Claude Code, Codex and opencode CLIs on this
// computer and the configuration each one reads, and holds conversations in folders: every message runs the agent's
// CLI in the folder, read-only by default, and its answer, its tool calls and its subagents stream into the window as
// they arrive. However long a conversation runs, the app's memory stays flat (services/chat.ts). See README.md.
//
//   zinc run examples/agents                       the folders Claude Code knows
//   zinc run examples/agents -- /path/to/project   that folder first
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { ActivityBar } from './components/ActivityBar';
import { SidePanel } from './components/SidePanel';
import { ChatPane, followChat } from './components/ChatPane';
import { DetailPanel } from './components/DetailPanel';
import { StatusBar } from './components/StatusBar';
import { menuOpen, closeMenu } from './components/SettingsBar';
import { start, sideOpen, detailOpen, viewed, viewedOutput, viewFile, viewOutput, stopCurrent } from './state';
import { BACKGROUND, CLEAR_COLOR, TEXT, bg, fg } from './theme';

// Escape: closes an open menu, then a viewer, else stops the running turn. The root's onKeyDown takes it before a focused field
// (which would only drop the focus), ui.onKey when nothing has the focus.
function escape(e: ui.KeyEvent): void {
  if (e.key !== 'Escape') return;
  if (menuOpen()) closeMenu();
  else if (viewed() !== null) viewFile(null);
  else if (viewedOutput() !== null) viewOutput(null);
  else if (!stopCurrent()) return;
  e.preventDefault();
}

function App(): i32 {
  return <View className={`flex-col w-full h-full ${bg(BACKGROUND)} ${fg(TEXT)}`} onKeyDown={escape}>
    <View className="grow min-h-0 flex-row">
      <ActivityBar />
      {sideOpen() && <SidePanel />}
      <ChatPane />
      {detailOpen() && <DetailPanel />}
    </View>
    <StatusBar />
  </View>;
}

ui.onKey(escape);

start();
render(App, CLEAR_COLOR, (dt: number) => followChat());
