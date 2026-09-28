// PocketJS compatibility (@pocketjs/framework/solid): mount(app) on the default light background.
import { render } from 'zinc:ui/solid';
export function mount(app: () => i32): void { render(app, 0xf8fafc, null); }
