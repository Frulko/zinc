import { SkinnedModel, AnimationPlayer, AnimationEvent, JointSocket } from 'zinc:animation';
import { Scene, Camera, Light, Node, Material, cube, plane } from 'zinc:3d';
import { readText } from 'zinc:assets';
interface Socket { name: string; joint: string; translation: number[]; }
interface Metadata { events: AnimationEvent[]; sockets: Socket[]; rootMotion: string; }
export class LabState {
  model: SkinnedModel;
  player: AnimationPlayer;
  scene = new Scene(); camera = new Camera();
  events: AnimationEvent[];
  eventCount: i32 = 0; lastEvent = 'none';
  socket: JointSocket;
  constructor() {
    const metadata: Metadata = JSON.parse(readText('companion.animation.json'));
    if (metadata.rootMotion !== 'controller') throw new Error('lab expects controller-owned in-place locomotion');
    this.events = metadata.events; this.model = new SkinnedModel('companion.glb');
    this.player = new AnimationPlayer(this.model, metadata.events);
    this.player.onEvent = (name: string): void => { this.eventCount++; this.lastEvent = name; };
    this.player.play('Walk', 0);
    this.scene.add(this.model); this.scene.background = 0x24333b; this.scene.ambient = 0x808080;
    this.scene.lights.push(new Light(-.4, -1, -.6, 0xffffff));
    const ground = new Node(plane(8, 8, 1, 1), new Material(0x405347)); this.scene.add(ground);
    this.camera.setPosition(2.9, 1.9, -3.5).lookAt(0,.7,0); this.camera.fov = 36;
    const mouth = metadata.sockets[0];
    this.socket = new JointSocket(this.model, mouth.joint);
    this.socket.position = mouth.translation;
    const stick = new Node(cube(.08), new Material(0xf5c257)); stick.setScale(8, 1, 1);
    this.socket.add(stick); this.model.add(this.socket);
  }
  next(): void { this.player.play(this.model.clips[(this.player.clip+1)%this.model.clips.length], .4); }
  seek(offset: number): void { this.player.seek(this.player.time + offset); }
}
