import { self, MessageEvent } from 'zinc:worker';
import { All, Back } from './types';

let seen: i32 = 0;
self.onmessage = (e: MessageEvent<All>) => {
  seen++;
  const back: Back = { echo: e.data, seen: seen };
  self.postMessage(back);
};
