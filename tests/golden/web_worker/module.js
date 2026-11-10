import { suffix } from './value.js';
onmessage = async event => {
  const source = await (await fetch('./value.js')).text();
  if (!source.includes(suffix)) throw new Error('worker relative fetch base');
  postMessage(event.data + suffix); close();
};
