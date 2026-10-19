// agents: a small ADE (agent development environment). It finds the Claude Code, Codex and opencode CLIs on this
// computer and the configuration each one reads, and opens chats in folders: every message runs the agent's CLI in
// the folder, read-only, and its answer streams into the window as it arrives. A feasibility demo: see README.md.
//
//   zinc run examples/agents                       the folders Claude Code knows
//   zinc run examples/agents -- /path/to/project   that folder first
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Sidebar } from './components/Sidebar';
import { ChatPane, followChat } from './components/ChatPane';
import { menuOpen, closeMenu } from './components/SettingsBar';
import { loadCatalogs } from './state';
import { BACKGROUND } from './theme';

function App(): i32 {
  return <View className="flex-row w-full h-full">
    <Sidebar />
    <ChatPane />
  </View>;
}

// Escape closes an open settings menu
ui.onKey((e: ui.KeyEvent) => { if (e.key === 'Escape' && menuOpen()) { closeMenu(); e.preventDefault(); } });

loadCatalogs();
render(App, BACKGROUND, (dt: number) => followChat());
