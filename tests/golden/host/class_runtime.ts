// The class of an object at run time: o.constructor.name, and an `any` view of an object that reads and writes the fields of its own
// class, not only those of the static type it had when it became an `any` (the inspector reads a zinc:stage node this way).
import { Base, peek } from './class_runtime_base';
abstract class Shape { x: number = 1; }
class Node2 extends Shape { visible: boolean = true; name: string = 'n'; }
class Sprite extends Node2 { alpha: number = 0.5; }
class GameManager extends Sprite {}
interface Labeled { label(): string; }
class Tag implements Labeled { label(): string { return 't'; } }
const v: Node2 = new GameManager();
const s: Shape = new Sprite();
const l: Labeled = new Tag();
const r = { a: 1 };
console.log(v.constructor.name, new Node2().constructor.name, s.constructor.name, l.constructor.name, r.constructor.name);
const kids: Node2[] = [new Node2(), new Sprite(), new GameManager()];
console.log(kids.map((k: Node2) => k.constructor.name).join(' '));
const d: any = v;
console.log(d.alpha, d.x, d.visible, d.name, d.scaleX === undefined);
d.x = 7;
d['alpha'] = 0.25;
console.log(v.x, (v as Sprite).alpha);
class Later extends Base { alpha: number = 0.75; }
console.log(peek(new Later()), peek(new Base()));
