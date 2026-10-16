// zinc:system/share (stub): this target has no system services. Everything here is safe to call and says "unsupported".
export class ShareContent {
  text: string = '';
  url: string = '';
  title: string = '';
}
export function isSupported(): boolean { return false; }
export async function share(c: ShareContent): Promise<boolean> { return false; }
