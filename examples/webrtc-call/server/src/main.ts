import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import { option, number, load, setup } from './config';
import { link, revoke } from './admin';
import { supervise } from './supervisor';
import { deployment } from './deployment';

async function main(): Promise<void> {
  const args = sys.args();
  const action = args.length === 0 ? 'help' : args[0];
  if (action === 'help' || action === '--help') {
    console.log('call-server setup --domain HOST [--room ROOM] [--data DIR] [--local --port PORT --udp-port PORT]');
    console.log('call-server run | link ROOM [--hours 24] [--moderator] | revoke ROOM TOKEN | deploy [--data DIR]');
    return;
  }
  if (['setup', 'run', 'link', 'revoke', 'deploy'].indexOf(action) < 0) throw new Error('Unknown command; run help');
  const values = action === 'setup' ? ['data', 'domain', 'room', 'port', 'udp-port', 'turn', 'max-clients', 'coturn-url', 'coturn-secret-file'] : action === 'link' ? ['data', 'hours'] : ['data'];
  const flags = action === 'setup' ? ['local', 'autokick'] : action === 'link' ? ['moderator'] : [];
  const operands: string[] = [];
  for (let i = 1; i < args.length; i++) {
    if (!args[i].startsWith('--')) { operands.push(args[i]); continue; }
    const name = args[i].slice(2);
    if (values.indexOf(name) >= 0) { option(args, name, ''); i++; }
    else if (flags.indexOf(name) < 0) throw new Error('Unknown option: ' + args[i]);
  }
  const count = action === 'link' ? 1 : action === 'revoke' ? 2 : 0;
  if (operands.length !== count) throw new Error('Wrong number of arguments; run help');
  const input = option(args, 'data', sys.dataDir() + '/server');
  const data = (input.startsWith('/') ? input : sys.launchDir() + '/' + input).replace(/\/+$/, '');
  if (action === 'setup') { await setup(data, args); deployment(data, load(data)); return; }
  const config = load(fs.realpath(data));
  if (action === 'run') {
    const supervisor = await supervise(fs.realpath(data), config);
    await supervisor.stopped;
    sys.exit(0);
  }
  else if (action === 'link') await link(data, config, operands[0], number(option(args, 'hours', '24'), 0.000001, 8760), args.indexOf('--moderator') >= 0);
  else if (action === 'revoke') await revoke(data, config, operands[0], operands[1]);
  else if (action === 'deploy') deployment(data, config);
  else throw new Error('Unknown command or missing room/token; run help');
}

main().catch((error: Error) => { console.error('call-server: ' + error.message); sys.exit(1); });
