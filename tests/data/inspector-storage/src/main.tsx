// The program tests/t1/inspector_storage.sh inspects with the Zinc Inspector's Storage panel: AsyncStorage keys (a theme as JSON, and a
// counter it writes every 300 ms, which the panel must follow live) and an in-memory SQLite database with a table of 120 songs (more
// than one page of rows). ZINC_STORAGE names a fresh store file.
import 'zinc:devtools';
import { render } from 'zinc:ui/solid';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Database } from 'zinc:sqlite';

const db = new Database(':memory:');
db.exec('CREATE TABLE songs (id INTEGER PRIMARY KEY, title TEXT NOT NULL, plays INTEGER)');
db.transaction(() => { for (let i = 1; i <= 120; i++) db.prepare('INSERT INTO songs (title, plays) VALUES (?, ?)').run([`Song ${i}`, i * 3]); });

async function start(): Promise<void> {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('theme', JSON.stringify({ mode: 'dark', accent: 'rose' }));
  let n = 0;
  setInterval(() => { n++; AsyncStorage.setItem('count', '' + n); }, 300);
}
start();

function App(): i32 {
  return <View className="flex-col p-4"><Text>{'Storage fixture'}</Text></View>;
}
render(App, 0xffffff, (dt: number) => {});
