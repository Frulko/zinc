import { args, env } from 'zinc:sys';
import { URL } from 'zinc:web';

export class Config {
  data: string = 'data';
  port: i32 = 8792;
  interval: number = 2;
  sonosAddress: string = '';
  apiKey: string = env('LASTFM_API_KEY');
  apiSecret: string = env('LASTFM_API_SECRET');
  sessionKey: string = env('LASTFM_SESSION_KEY');
}

export function readConfig(argv: string[] = args()): Config {
  const config = new Config();

  for (let i = 0; i < argv.length; i += 2) {
    const option = argv[i];
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
      throw new Error('Missing value for ' + option);
    }
    const value = argv[i + 1];

    if (option === '--data') config.data = value;
    else if (option === '--sonos') config.sonosAddress = value;
    else if (option === '--interval') config.interval = Number(value);
    else if (option === '--port') {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('--port must be an integer from 1 to 65535');
      }
      config.port = port as i32;
    } else {
      throw new Error('Unknown option: ' + option);
    }
  }

  if (!Number.isInteger(config.interval) || config.interval < 1 || config.interval > 15) {
    throw new Error('--interval must be an integer from 1 to 15 seconds');
  }
  if (config.data === '') throw new Error('--data must not be empty');
  if (config.sonosAddress.startsWith('http://')) {
    config.sonosAddress = new URL(config.sonosAddress).host;
  }
  return config;
}
