// The camera: an orbit around a point (the planet, or the station), steered by the pad, drifting slowly when left alone. On the 3DS's
// stereoscopic screen each eye's camera is moved sideways by the 3D slider, both looking at the same point (it stays on the screen's plane).
import { Camera, Node } from 'zinc:3d';
import { Pad } from './input';
import { CAMERA_DRIFT, CAMERA_TURN, CAMERA_ZOOM, CAMERA_NEAR, CAMERA_FAR, EYE_SEPARATION } from './constants';

/** The views Start goes through: the whole system, the rings close up, following the station. */
const VIEW_DISTANCE: number[] = [16, 8, 2.6];
const VIEW_PITCH: number[] = [0.32, 0.12, 0.3];
export const VIEW_NAMES: string[] = ['System', 'Rings', 'Station'];

export class OrbitCamera {
  readonly camera = new Camera();
  view: i32 = 0;
  private yaw = 2.6;   // the sun over the left shoulder: the lit side faces the camera
  private pitch = 0.32;
  private distance = 16;
  // what the camera looks at, eased towards its goal so a change of view glides
  private at: number[] = [0, 0, 0];

  constructor() {
    this.camera.fov = 50;
    this.camera.near = 0.3;
    this.camera.far = 120;
  }

  nextView(): void {
    this.view = (this.view + 1) % VIEW_NAMES.length;
    this.distance = VIEW_DISTANCE[this.view];
    this.pitch = VIEW_PITCH[this.view];
  }

  update(dt: number, pad: Pad, station: Node): void {
    this.yaw += (pad.active() ? pad.turnX * CAMERA_TURN : CAMERA_DRIFT) * dt;
    this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + pad.turnY * CAMERA_TURN * dt));
    const near = this.view === 2 ? 1.2 : CAMERA_NEAR;
    this.distance = Math.max(near, Math.min(CAMERA_FAR, this.distance + pad.zoom * CAMERA_ZOOM * dt));
    const follow = this.view === 2;
    const k = Math.min(1, dt * 4);
    this.at[0] += ((follow ? station.position[0] : 0) - this.at[0]) * k;
    this.at[1] += ((follow ? station.position[1] : 0) - this.at[1]) * k;
    this.at[2] += ((follow ? station.position[2] : 0) - this.at[2]) * k;
  }

  /** Places the camera for `eye` (0 left or flat, 1 right) with the 3D slider at `depth` (0..1, below 0 for no stereo). */
  place(eye: i32, depth: number): void {
    const cp = Math.cos(this.pitch), d = this.distance;
    const ox = Math.sin(this.yaw) * cp * d, oy = Math.sin(this.pitch) * d, oz = Math.cos(this.yaw) * cp * d;
    // sideways: the camera's right vector, horizontal
    const shift = depth > 0 ? (eye === 0 ? -1 : 1) * depth * EYE_SEPARATION * Math.min(1, d / 8) : 0;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    this.camera.setPosition(this.at[0] + ox + rx * shift, this.at[1] + oy, this.at[2] + oz + rz * shift).lookAt(this.at[0], this.at[1], this.at[2]);
  }
}
