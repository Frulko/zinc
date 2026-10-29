import { World } from './world';
import { Database } from 'zinc:sqlite';

const world = new World(320, 240);
const db = new Database(':memory:');
world.step(1 / 60);
db.close();
