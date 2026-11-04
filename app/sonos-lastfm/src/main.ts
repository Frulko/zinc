import { onSignal, exit } from 'zinc:sys';
import { stop } from 'zinc:net';
import { readConfig } from './config';
import { Lastfm, LastfmDelivery, Store } from 'zinc:lastfm';
import { SonosMonitor } from './monitor';
import { Log } from './log';
import { startServer, Status } from './server';

async function main(): Promise<void> {
  const config = readConfig();
  if (config.apiKey === '' || config.apiSecret === '') {
    throw new Error('Set LASTFM_API_KEY and LASTFM_API_SECRET; no Last.fm password is needed');
  }

  const store = new Store(config.data);
  store.load();
  const log = new Log();
  const api = new Lastfm(config.apiKey, config.apiSecret);
  const delivery = new LastfmDelivery(api, store, log, config.sessionKey);
  const monitor = new SonosMonitor(config.sonosAddress, config.interval, store, log);

  const port = startServer(config.port, config.data, (): Status => ({
    authorized: api.session !== '',
    groups: monitor.system.groups,
    listens: store.listens,
    pending: store.pending,
    rejected: store.rejected,
    sent: store.sent,
    retryAt: delivery.retryAt,
    lastError: log.lastError,
  }));
  console.log('Last.fm: ' + (api.session !== '' ? 'session loaded' : 'authorization needed') +
    '; ' + store.pending.length.toString() + ' pending, ' + store.sent.toString() + ' scrobbled');

  let running = true;
  const shutdown = (): void => {
    running = false;
    stop(port);
  };
  onSignal('SIGTERM', shutdown);
  onSignal('SIGINT', shutdown);

  async function watchSonos(): Promise<void> {
    while (running) {
      await monitor.update();
      if (running) await new Promise<void>((resolve) => { setTimeout(resolve, config.interval * 1000); });
    }
  }

  async function sendToLastfm(): Promise<void> {
    while (running) {
      if (monitor.nowPlaying !== null) {
        delivery.nowPlaying = monitor.nowPlaying;
        monitor.nowPlaying = null;
      }
      await delivery.update();
      if (running) await new Promise<void>((resolve) => { setTimeout(resolve, 1000); });
    }
  }

  try {
    await Promise.all([watchSonos(), sendToLastfm()]);
  } finally {
    shutdown();
    store.save();
  }
}

main().catch((error: Error) => {
  console.error('sonos-lastfm: ' + error.message);
  exit(1);
});
