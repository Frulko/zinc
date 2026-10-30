// zinc:shell native side (POSIX): the socket, the apps' buffers as one runtime image, their processes. Wire: plugins/display-remote/remote_proto.h
// (SH_*), design: docs/reports/zinc-shell/03-design.md.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  start(dir: string, name: string): i32;
  home(): void;
  current(): string;
  title(): string;
  image(): i32;
  barHeight(): i32;
  responding(): boolean;
  serial(): i32;
  onExit(cb: (name: string, status: i32) => void): void;
}
export default requireNative<Spec>('Shell');
