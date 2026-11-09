import { self, MessageEvent } from 'zinc:worker';
import { Packet, UNUSED_LAYOUT_MARKER } from './types';
self.onmessage = (e: MessageEvent<Packet>) => {
  e.data.count++;
  self.postMessage(e.data);
};
