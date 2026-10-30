// The two logins of src/services/auth.ts. First the remote-auth key exchange against vectors recorded with OpenSSL (an RSA-2048 key, a
// nonce, a user payload and a fake token encrypted with RSA-OAEP-SHA256 by `openssl pkeyutl`, the nonce's proof by `openssl dgst`), no
// network; then, against the fake Discord (DISCORD_API, DISCORD_REMOTE_AUTH): the QR code login from the key to the token, a wrong
// password, a password with a TOTP code, and a captcha that says to use the QR code. Prints "ok" or the first check that failed;
// tests/t1/discord_login.sh. No real token or password: the fake's.
import { subtle } from 'zinc:subtle';
import { base64Encode, base64Decode } from 'zinc:web';
import { exit } from 'zinc:sys';
import { decrypt, utf8, proofOf, payloadName, QrLogin, Mfa, passwordLogin, mfaLogin, loginError } from '../src/services/auth';
import { QR_LINK } from '../src/constants';
import { allowScripts } from '../src/safety/index';

const KEY =
  '308204a302010002820101008f57b3e4d0254a302f0336db43f1a3d8df07a942478df3e03e2681f5b35494487b294d40a0c7c3edd4e3788b30191cfb42ff3fdb34f25307fa24d7aedc9387e901d38dc2' +
  'fe9c070bc8a63a1202ad1f52f05aa414592369d16f141392fc22eceb2eeff9755d844856c6dfb98d5f6c61dd2db7dbf1f3b843c06420e98a7156723ef67461bce8b3a54011442d678eb0582b7f87945b' +
  '963d85b2145d01b6e8ce120c9f4956aa0b65773b16690c01a268927f6cb374c62b1e4ac8c8cd9cb0838c9d63654b02dcfea18fd85ee57b9cf4147944a447ad7880349cb5c5169245a893cec061d9940f' +
  'fe02a187c8078186482f0208abb820800389ad40d0d06271fe3cf8310203010001028201001db01ef09d9193977e2d2ebfe4071895d2bf8df54dc79f428aecc3cee518f7eb3922f93e90ee3eecb3c277' +
  '1570dd4aacd997ef1c520f7c55f31f8d524899ffb4a92dad373d2f88a00eab2aeccf04173040daad100fd42f56f2a81853c187e444e3804d4cdb150a3c7acd1c6ba4df58378c7fff7c51ab90d0b88c3e' +
  '826f6de5944854b691442b688f439f991e2882fc7ce5fce72916382b3c559c972418df30ffeb5b4b47ac5a1d39abd4b1acdf8650fa4e707b64e82d7d212ac5b72844d5c11442e8dce93868907d0a14fc' +
  '0a521ba978487a5cbbdd8ca153cd0940a47a9b99b6643be4bd788f2ca1e8b23d26602f35f030ec4f145c8b0871a632d1729b414e7f02818100ca32e65e290d24259e53500533546017c01eda4bbc77c8' +
  '9543c1c8dedc20e63b0b65d8b60d3807e4a5e8c503025a2b0f4097d708261e667ed17ffaceadee8e2f4b6412f6b82d26d25dfe46e6a5aa1a5d64f083bb5567fda8fb47302ed393e2c69b697c9d0eb8b5' +
  'f0eb603ae856983e5e7e644f513c563a64548070612477b46302818100b57bb7068b481374b12509859848df7eb46d3db4f4b0cdfe10e970b6c79d35574cbe5f55845341fb9439992ae7c740ec54c17a' +
  '03789d7443eebe2eb17c7bb9d29f3deefbb43283ae35254aa8e4d399a50a15f31b18705befdbf64c48476a013b3b12e9b24cb37308676f1a78ea28061c82bc769cc9aededee33959237fe9935b028180' +
  '4f617641673a6a837e49d4f385b84d5565ae77231ea5a410bd9e197f2cca99b87a7c0c7d446947e8031e8421ef4d78f42ef6ad8bdc7338e7f6d598a085764f49cffe44d7a96cc87df43abc991656d6ac' +
  'edd0e2d6abebfc90d7bd95f3fc4a65d074f90fdc15087d1d4d3ae5458ba18f72c78a17fd9b837abf22d19dccf5652d630281802552aa1358759c3ab56bae87a107eb9ebd30722e52dc41a0ec8d75b6c1' +
  '5a9d6bb4c6ba08764c4117a2262e4fda96e9cd30a91194c12b708bbfffb0cea39136681083c63051a0c9dffbe20d76aa88b1e2752e8a6e9a1a116e44c8646bc0f41608be5f675c59d5d5e476912cda8d' +
  '1d6a1456f6b7560b4c415d895173f98f06d45d02818100b5b95b086d1b685956aebe8cf2193be5fddfbb07aab496a7880609233b0eb00e34dc46ca01ea8a58f714c355c91e4dd0c5afa38add695855f4' +
  'b87d4147652a6b51f190beed593d002282b7bed42f08bc70700a3390fc9f720dee2f5d9f07e5e513bd3c0b024697512a3750a46bdbada3afabdbbbe5e00ab2de27c08e57b223b2';
const SPKI = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAj1ez5NAlSjAvAzbbQ/Gj2N8HqUJHjfPgPiaB9bNUlEh7KU1AoMfD7dTjeIswGRz7Qv8/2zTyUwf6JNeu3JOH6QHTjcL+nAcLyKY6EgKtH1LwWqQUWSNp0W8UE5L8IuzrLu/5dV2ESFbG37mNX2xh3S232/HzuEPAZCDpinFWcj72dGG86LOlQBFELWeOsFgrf4eUW5Y9hbIUXQG26M4SDJ9JVqoLZXc7FmkMAaJokn9ss3TGKx5KyMjNnLCDjJ1jZUsC3P6hj9he5Xuc9BR5RKRHrXiANJy1xRaSRaiTzsBh2ZQP/gKhh8gHgYZILwIIq7gggAOJrUDQ0GJx/jz4MQIDAQAB';
const NONCE = 'Y33qc6O5hbEb5Ym9KLl/onLScKYCtVabmi5xVE+TOFFiKHJveeEcyGeUwTnLx/PI2xU9/u358L9SwjrQK0ToZnkcSQ0nFNEeeAEhLFG8AcjkYXWG4DH+C9IiC6rvlVBsB5NK/okuA/ugz2fVZrXYwjFwlIJan6zj0yHhDzDW25eWWlimbOr8SrJcpztCuq7mGrdvqemrbDgLaAOOztNcyLlg2jzO0N+IWaWGKZzdlo2oc4t8ZM0nltdks4aDEmhmA72B6VI+neSQQ25RkHBv4FAev62zzLTaO+7rFe9W7pZRI0sjTaSKObSPVBrx/yXhPfQbiIItjMcB7wvlpeA6dQ==';
const USER = 'RqE92CpeboPdyIZkUDXxYRa9/q4cEsskojq+6tBV3wQ2nCrnlFlW2M3gs/8C0zWI8i91pc12LPEwkle+CIPYkODINN2GLS8WgkcOq2HbypFTHLeDj/B5glRY4syx83u+aHpyYvumoiEQ5/BEz0Kcr/NcvP5a/rTsmL+ZIwZ1XeLXK7ts/yNxDTkJARQxgoYcqR1iBZnA2+QDNCzjlmU5kk4jURWGFLkiJZy3BivN+a5VPDZnxNE3CBEZuJjce7bmJPT8iNRjjleoQ+yVl2ez+txWNVFQ71pGgnh2pzXtp5Sod6GP/4Qqsi1kdzfiBg33QBD8VyyEgz6b5awxd+YUUg==';
const TOKEN = 'YznVk0NHTNujmNlaXcUMWH6xzWyEKiSVB42WCVa/jo8m3s2gtDbmqdz5+X2LQ0FT1HbmUSE+GhVTjr5B9BDfB19w1rhHfb/UihUzpUjsvY7VLVnXZZnlbxx9jLG3mOmkRm0Z7NmpNkw2Fjyoh2AI78rfI5FNMNDKrW8UBrxIr8kgallAwtNsihmkU+NQ0n+sQPhFV9p/rh0Uv3V5fiX9qgtvb9s2cbkMf4/SHh2roeQ6XzWA881LGg9bsa2hbw00rDvL3ROe9T3Rw3iUVjKssCN4xq6lIdmf7Q8L37fZ4sRVy8U6aunbAHsiyZfY7rbxTU2HM0cCj/oLkXkpFqs/EQ==';
const PROOF = 'xjAwg_Ep-cz_WUFoCYKX_4Up6n9dNiRMB5VHnBaBmHk';

let failed = '';
function check(name: string, ok: boolean): void { if (!ok && failed === '') failed = name; }
function hex(s: string): u8[] { const r: u8[] = []; for (let i = 0; i < s.length; i += 2) r.push(parseInt(s.slice(i, i + 2), 16)); return r; }
const wait = (ms: number): Promise<void> => new Promise<void>((done: () => void) => { setTimeout(done, ms); });

async function vectors(): Promise<void> {
  const oaep = { name: 'RSA-OAEP', hash: 'SHA-256' };
  const key = await subtle.importKey('raw-private', hex(KEY), oaep, false, ['decrypt']);
  check('the public key as the gateway gets it (SPKI)', base64Encode(await subtle.exportKey('spki', await subtle.importKey('spki', base64Decode(SPKI), oaep, true, ['encrypt']))) === SPKI);
  const nonce = await decrypt(key, NONCE);
  check('the nonce', utf8(nonce) === 'fake-nonce-0123456789abcdef0123');
  check('the nonce proof', (await proofOf(nonce)) === PROOF);
  check('the user payload', payloadName(utf8(await decrypt(key, USER))) === 'ada');
  check('the token', utf8(await decrypt(key, TOKEN)) === 'fake-token.not-real.0000');
}

async function qrLogin(): Promise<void> {
  let token = '', seen = '';
  const qr = new QrLogin((): void => { if (qr.stage === 'confirm') seen = qr.user; }, (t: string): void => { token = t; });
  await qr.start();
  for (let i = 0; i < 500 && token === '' && qr.stage !== 'expired'; i++) await wait(20);
  check(`qr: ${qr.error}`, qr.error === '');
  check('qr: the code', qr.link === QR_LINK + 'fp-123');
  check('qr: the user to confirm', seen === 'ada');
  check('qr: the token', token === 'test-token');
}

async function password(): Promise<void> {
  const mfa = new Mfa();
  let message = '';
  try { await passwordLogin('ada@example.com', 'wrong', mfa); } catch (e) { message = loginError(e as Error); }
  check('a wrong password says so', message === 'Login or password is invalid.');
  check('the password asks for the code', (await passwordLogin('ada@example.com', 'right', mfa)) === '' && mfa.totp && mfa.ticket === 'mfa-ticket');
  check('the TOTP code logs in', (await mfaLogin('totp', '123 456', mfa)) === 'test-token');
  message = '';
  try { await passwordLogin('captcha@example.com', 'right', mfa); } catch (e) { message = loginError(e as Error); }
  check('a captcha says to use the QR code', message.indexOf('QR code') > 0);
}

async function main(): Promise<void> {
  check('the guard lets a script log in against the fake Discord only', allowScripts());   // no person here: the guard's human origin is waived
  await vectors();
  await qrLogin();
  await password();
  console.log(failed === '' ? 'ok' : failed);
  exit(0);
}
main();
