// The program tests/t1/inspector_storage.sh inspects with the Zinc Inspector's Storage panel: AsyncStorage keys (a theme and a place as
// JSON, and a counter it writes every 300 ms, which the panel must follow live) and an in-memory SQLite database with a table of 120 songs
// (more than one page of rows, an index) and a table of covers (a NULL, a blob). ZINC_STORAGE names a fresh store file.
import 'zinc:devtools';
import { render } from 'zinc:ui/solid';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Database } from 'zinc:sqlite';
import { Blob } from 'zinc:web';

const db = new Database(':memory:');
db.exec('CREATE TABLE songs (id INTEGER PRIMARY KEY, title TEXT NOT NULL, plays INTEGER)');
db.exec('CREATE INDEX songs_plays ON songs (plays)');
db.transaction(() => { for (let i = 1; i <= 120; i++) db.prepare('INSERT INTO songs (title, plays) VALUES (?, ?)').run([`Song ${i}`, i * 3]); });
db.exec('CREATE TABLE covers (id INTEGER PRIMARY KEY, art BLOB, note TEXT)');
db.prepare('INSERT INTO covers (art, note) VALUES (?, ?)').run([Blob.fromBytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2]), null]);

async function start(): Promise<void> {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('theme', JSON.stringify({ mode: 'dark', accent: 'rose' }));
  await AsyncStorage.setItem('weather.place', JSON.stringify({ name: 'Paris', coords: { lat: 48.85, lon: 2.35 }, tags: ['home', 'fr'] }));
  let n = 0;
  setInterval(() => { n++; AsyncStorage.setItem('count', '' + n); }, 300);
}
start();

function App(): i32 {
  return <View className="flex-col p-4"><Text>{'Storage fixture'}</Text></View>;
}
render(App, 0xffffff, (dt: number) => {});
