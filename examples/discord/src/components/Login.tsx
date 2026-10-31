// The login screen: the email and password (then the two-factor code), or a pasted token, on the left; the QR code for Discord's phone app
// on the right (services/auth.ts). The QR code starts with the screen and stops when it is left; an expired one waits for "New code".
import { useState, useEffect } from 'zinc:ui/react';
import { rect } from 'zinc:gfx';
import { encode, QrCode } from 'zinc:qrcode';
import { env } from 'zinc:sys';
import { store } from '../state';
import { QrLogin, Mfa, passwordLogin, sendSms, mfaLogin, loginError } from '../services/auth';
import { BG_MAIN, BG_SURFACE, BG_INPUT, BG_ACCENT, TEXT_MAIN, TEXT_MUTED, TEXT_STRONG, TEXT_ERROR } from '../constants';

const qr = new QrLogin((): void => { store.changed(); }, (token: string): void => { store.login(token); });
store.onChange((): void => { if (store.stage !== 'login' && qr.stage !== 'idle') qr.cancel(); });
const mfa = new Mfa();
let code: QrCode | null = null, codeOf = '';
function drawQr(x: i32, y: i32, w: i32, h: i32): void {
  if (codeOf !== qr.link) { code = encode(qr.link); codeOf = qr.link; }
  const c = code as QrCode, s = Math.max(1, Math.floor(Math.min(w, h) / c.size));
  const ox = x + Math.floor((w - s * c.size) / 2), oy = y + Math.floor((h - s * c.size) / 2);
  for (let row = 0; row < c.size; row++) {
    const runs = c.runs(row);
    for (let i = 0; i < runs.length; i += 2) rect(ox + s * runs[i], oy + s * row, s * runs[i + 1], s, 0x000000);
  }
}

function Button(props: { label: string; busy: boolean; onPress: () => void }) {
  return <View className={`h-[44] items-center justify-center rounded ${BG_ACCENT} active:bg-[var(--dc-accent-pressed)]`} aria-label={props.label}
    onPress={() => { if (!props.busy) props.onPress(); }}>
    <Text className="text-white font-semibold">{props.busy ? 'Logging in…' : props.label}</Text>
  </View>;
}
function Link(props: { label: string; onPress: () => void }) {
  return <Text className="text-sm text-[var(--dc-link)]" onPress={props.onPress}>{props.label}</Text>;
}
const label = (t: string) => <Text className={`text-xs font-bold uppercase ${TEXT_MUTED}`}>{t}</Text>;
const field = `w-full h-[40] px-3 rounded border-0 ${BG_INPUT} ${TEXT_MAIN}`;

function QrPane() {
  const text = qr.stage === 'scan' ? 'Scan it with the Discord app on your phone (You, then Scan QR Code) to log in at once.'
    : qr.stage === 'confirm' ? `Confirm the login of ${qr.user} on your phone.`
    : qr.stage === 'starting' || qr.stage === 'done' ? 'Making a QR code…' : qr.error !== '' ? qr.error : 'The QR code expired.';
  return <View className="w-[240] items-center gap-3">
    <View className="w-[184] h-[184] p-3 rounded-lg bg-white items-center justify-center">
      {qr.stage === 'scan' ? <Canvas className="w-[160] h-[160]" onDraw={drawQr} aria-label="QR code" /> : null}
    </View>
    <Text className={`text-xl font-bold text-center ${TEXT_STRONG}`}>Log in with a QR code</Text>
    <Text className={`text-sm text-center ${TEXT_MUTED}`}>{text}</Text>
    {qr.stage === 'expired' || qr.stage === 'idle' ? <Link label="New code" onPress={() => { qr.start(); }} /> : null}
  </View>;
}

export function Login() {
  const [login, setLogin] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [secret, setSecret] = useState<string>('');   // the two-factor code or the token
  const [step, setStep] = useState<string>('password');   // 'password', 'mfa' or 'token'
  const [busy, setBusy] = useState<boolean>(false);
  const [note, setNote] = useState<string>('');
  useEffect((): void => { if (qr.stage === 'idle' && env('DISCORD_TOKEN') === '') qr.start(); }, []);
  const failed = (e: Error): void => { setBusy(false); store.error = loginError(e); store.changed(); };
  const done = (token: string): void => { setBusy(false); qr.cancel(); store.login(token); };
  const attempt = (f: () => Promise<void>): void => { setBusy(true); store.error = ''; store.changed(); f().catch(failed); };
  const signIn = (): void => attempt(async (): Promise<void> => {
    const t = await passwordLogin(login.trim(), password, mfa);
    if (t !== '') { done(t); return; }
    setBusy(false); setSecret(''); setNote(''); setStep('mfa');
  });
  const verify = (kind: string): void => attempt(async (): Promise<void> => { done(await mfaLogin(kind, secret, mfa)); });
  const sms = (): void => attempt(async (): Promise<void> => { const phone = await sendSms(mfa); setBusy(false); setNote(`A code was sent to ${phone}.`); });
  const busyNow = busy || store.stage === 'connecting';

  let form;
  if (step === 'mfa') form = <View className="gap-3">
    <Text className={`text-sm ${TEXT_MUTED}`}>{mfa.totp ? 'Enter the code from your authenticator app' : 'Enter the code Discord sent by SMS'}{mfa.sms && mfa.totp ? ', or ask for one by SMS.' : '.'}</Text>
    {label('Code')}
    <Input className={field} value={secret} onInput={(v: string) => setSecret(v)} onChange={(v: string) => { setSecret(v); }} placeholder="6-digit code" aria-label="Code" />
    {note !== '' ? <Text className={`text-sm ${TEXT_MUTED}`}>{note}</Text> : null}
    <Button label="Log in" busy={busyNow} onPress={() => { verify(mfa.totp && note === '' ? 'totp' : 'sms'); }} />
    <View className="flex-row gap-4">
      {mfa.sms && note === '' ? <Link label="Send the code by SMS" onPress={sms} /> : null}
      <Link label="Back" onPress={() => { setStep('password'); }} />
    </View>
  </View>;
  else if (step === 'token') form = <View className="gap-3">
    {label('Token')}
    <Input type="password" className={field} value={secret} onInput={(v: string) => setSecret(v)} onChange={(v: string) => { setSecret(v); }} placeholder="Paste your token" aria-label="Token" />
    <Button label="Log in" busy={busyNow} onPress={() => { qr.cancel(); store.login(secret); }} />
    <Link label="Log in with your email instead" onPress={() => { setStep('password'); }} />
  </View>;
  else form = <View className="gap-3">
    {label('Email or phone number')}
    <Input className={field} value={login} onInput={(v: string) => setLogin(v)} onChange={(v: string) => { setLogin(v); }} aria-label="Email" />
    {label('Password')}
    <Input type="password" className={field} value={password} onInput={(v: string) => setPassword(v)} onChange={(v: string) => { setPassword(v); }} aria-label="Password" />
    <Button label="Log in" busy={busyNow} onPress={signIn} />
    <Link label="Paste a token instead" onPress={() => { setSecret(''); setStep('token'); }} />
  </View>;

  return <View className={`grow items-center justify-center ${BG_MAIN}`}>
    <View className={`w-[780] flex-row gap-8 p-8 rounded-lg ${BG_SURFACE}`}>
      <View className="grow basis-0 gap-3">
        <Text className={`text-2xl font-bold text-center ${TEXT_STRONG}`}>Welcome back</Text>
        <Text className={`text-sm text-center ${TEXT_MUTED}`}>An unofficial client: Discord's terms do not allow it. Try it with a spare account.</Text>
        {form}
        {store.error !== '' ? <Text className={`text-sm ${TEXT_ERROR}`}>{store.error}</Text> : null}
      </View>
      <QrPane />
    </View>
  </View>;
}
