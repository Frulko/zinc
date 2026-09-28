// zinc:os for sim: Node's os module in the shapes of runtime/mod/os.cpp
import * as os from 'node:os';
export const hostname = () => os.hostname();
export const homedir = () => os.homedir();
export const tmpdir = () => os.tmpdir();
export const arch = () => os.arch();
export const type = () => os.type();
export const release = () => os.release();
export const uptime = () => os.uptime();
export const loadavg = () => os.loadavg();
export const totalmem = () => os.totalmem();
export const freemem = () => os.freemem();
export const availableParallelism = () => os.availableParallelism();
export const cpus = () => os.cpus().map(c => ({ model: c.model, speed: c.speed }));
export const networkInterfaces = () => Object.entries(os.networkInterfaces()).flatMap(([name, list]) =>
  list.map(i => ({ name, address: i.address, netmask: i.netmask, family: i.family, mac: i.mac, internal: i.internal })));
export const userInfo = () => { const u = os.userInfo(); return { username: u.username, uid: u.uid, gid: u.gid, shell: u.shell ?? '', homedir: u.homedir }; };
