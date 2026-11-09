import { self, MessageEvent } from 'zinc:worker';
import { NAMES } from 'zinc:icons/lucide';
import { defaultSvg } from '../library/worker-defaults';
self.onmessage = (event: MessageEvent<string>) => {
  if (defaultSvg().length === 0) throw new Error('worker default icon missing');
  self.postMessage('worker-icons:' + NAMES.join(','));
};
