// Forms: a sign-up form and a settings form. Text fields with keyboard types and secure entry, a date picker, a select, checkboxes, radios, a
// textarea with a counter and a stepper; errors show after the first submit and clear as the field is fixed; the submit goes to the network
// (api.ts: the mock answers when offline or deterministic) and ends in a success or an error state.
import { useState } from 'zinc:ui/react';
import { View, Text, Switch, KeyboardAvoidingView, StyleSheet } from 'zinc:react-native';
import { Icon } from 'zinc:icons';
import { theme, SP } from '../theme';
import { tr, language, setLanguage } from '../i18n';
import { Screen, Section, ActionButton, EmptyState, Divider, toast, s as k } from '../parts';
import { Field, Checkbox, Radio, Segmented, Stepper, Select, DateField, Day, formatDay } from '../controls';
import { api, SignUp } from '../api';
import { prefs, savePrefs } from '../store';
import { nav, trace } from '../nav';

const COUNTRIES: string[] = ['France', 'Germany', 'Japan', 'Kenya', 'Brazil', 'Canada', 'India', 'United Kingdom'];
const INTERESTS: string[] = ['Design', 'Music', 'Code', 'Games'];

/** The validation rules, one message per field ('' when it is fine). */
export function validate(f: SignUp, birthday: Day | null, terms: boolean): string[] {
  const at = f.email.indexOf('@');
  return [
    f.name.trim() === '' ? tr('Required') : '',
    f.email === '' ? tr('Required') : (at < 1 || f.email.indexOf('.', at) < 0 ? tr('Not a valid email') : ''),
    f.password.length < 8 ? tr('At least 8 characters') : '',
    birthday === null ? tr('Required') : '',
    terms ? '' : tr('Please accept the terms'),
  ];
}

export function FormsScreen() {
  const [page, setPage] = useState(0);
  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
    <View style={{ paddingHorizontal: SP * 4, paddingTop: SP * 3 }}><Segmented options={[tr('Sign up'), tr('Settings')]} value={page} onChange={setPage} /></View>
    {page === 0 ? <SignUpForm /> : <SettingsForm />}
  </KeyboardAvoidingView>;
}

function SignUpForm() {
  const c = theme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState<Day | null>(null);
  const [country, setCountry] = useState(-1);
  const [interests, setInterests] = useState<string[]>([]);
  const [plan, setPlan] = useState(0);
  const [bio, setBio] = useState('');
  const [seats, setSeats] = useState(1);
  const [terms, setTerms] = useState(false);
  const [tried, setTried] = useState(false);
  const [state, setState] = useState('idle');   // idle, sending, done, failed
  const [reply, setReply] = useState('');
  const form = new SignUp(name, email, password, phone, formatDay(birthday), country >= 0 ? COUNTRIES[country] : '', interests.join(','), plan, bio, seats);
  const errs = tried ? validate(form, birthday, terms) : ['', '', '', '', ''];
  const submit = (): void => {
    setTried(true);
    const bad = validate(form, birthday, terms);
    if (bad.join('') !== '') { trace(`signup invalid: ${['name', 'email', 'password', 'birthday', 'terms'].filter((f: string, i: number) => bad[i] !== '').join(',')}`); toast(tr('Check the fields in red'), 'circle-alert'); return; }
    setState('sending');
    api.signUp(form).then((r: string): void => { trace(`signup ok: ${r}`); setReply(r); setState('done'); }).catch((e: Error): void => { setReply(e.message); setState('failed'); });
  };
  if (state === 'done') return <Screen><Section title="Sign up">
    <EmptyState icon="circle-check" tone="ok" title={tr('Welcome aboard!')} body={reply} action={tr('Back')} onAction={() => { setState('idle'); setTried(false); }} />
  </Section></Screen>;
  const toggle = (t: string): void => setInterests(interests.indexOf(t) >= 0 ? interests.filter((x: string) => x !== t) : interests.concat([t]));
  return <Screen>
    <Section title="Create your account">
      <View style={k.pad}>
        <Field label={tr('Name')} value={name} onChange={setName} placeholder="Ada Lovelace" error={errs[0]} />
        <Field label={tr('Email')} value={email} onChange={setEmail} placeholder="ada@example.com" keyboardType="email-address" error={errs[1]} />
        <View style={{ gap: SP }}>
          <Field label={tr('Password')} value={password} onChange={setPassword} placeholder="8+ characters" secure={!show} error={errs[2]} />
          <Checkbox label="Show password" on={show} onToggle={() => setShow(!show)} />
        </View>
        <Field label={tr('Phone')} value={phone} onChange={setPhone} placeholder="+33 6 12 34 56 78" keyboardType="phone-pad" />
        <DateField label={tr('Birthday')} value={birthday} onChange={(d: Day) => setBirthday(d)} error={errs[3]} />
        <Select label={tr('Country')} options={COUNTRIES} value={country} onChange={setCountry} placeholder="Choose a country" />
      </View>
    </Section>
    <Section title="Interests">
      <View style={k.pad}>{INTERESTS.map((t: string) => <Checkbox label={t} on={interests.indexOf(t) >= 0} onToggle={() => toggle(t)} />)}</View>
    </Section>
    <Section title="Plan">
      <View style={k.pad}>
        <Radio label="Free" sub="One project, community help" on={plan === 0} onPress={() => setPlan(0)} />
        <Radio label="Pro" sub="Unlimited projects, 9 € a month" on={plan === 1} onPress={() => setPlan(1)} />
        <Radio label="Team" sub="Everything in Pro, per seat" on={plan === 2} onPress={() => setPlan(2)} />
        {plan === 2 && <View style={[k.rowFlat, { justifyContent: 'space-between' }]}><Text style={[k.body, { color: c.ink }]}>{tr('Seats')}</Text><Stepper value={seats} min={1} max={20} onChange={setSeats} /></View>}
      </View>
    </Section>
    <Section title="About you">
      <View style={k.pad}>
        <Field label={tr('About you')} value={bio} onChange={setBio} placeholder="A few words" multiline={true} maxLength={160} />
        <Text style={[k.tiny, { color: c.muted, textAlign: 'right' }]}>{`${bio.length}/160`}</Text>
        <Checkbox label={tr('I accept the terms')} on={terms} onToggle={() => setTerms(!terms)} />
        {errs[4] !== '' && <Text style={[k.small, { color: c.danger }]}>{errs[4]}</Text>}
        {state === 'failed' && <View style={[st.banner, { backgroundColor: c.dangerSoft }]}><Icon name="wifi-off" size={18} color={() => theme().danger} /><Text style={[k.small, { color: c.danger, flex: 1 }]}>{reply}</Text></View>}
        <ActionButton title={tr('Sign up')} icon="send" busy={state === 'sending'} onPress={submit} />
      </View>
    </Section>
  </Screen>;
}

function SettingsForm() {
  const c = theme();
  const [digest, setDigest] = useState(prefs.digest);
  const [units, setUnits] = useState(prefs.units);
  const [lang, setLang] = useState(language() === 'fr' ? 1 : 0);
  const [nick, setNick] = useState(prefs.nickname);
  const [saving, setSaving] = useState(false);
  const save = (): void => {
    setSaving(true);
    prefs.digest = digest; prefs.units = units; prefs.nickname = nick; prefs.lang = lang === 1 ? 'fr' : 'en';
    savePrefs();
    api.saveSettings(nick, digest).then((r: string): void => { setSaving(false); toast(tr('Saved')); setLanguage(prefs.lang); nav.relabel(); })
      .catch((e: Error): void => { setSaving(false); toast(e.message); });
  };
  return <Screen>
    <Section title="Settings" note="Stored on this device (zinc:storage) and sent to the server.">
      <View style={k.pad}><Field label="Nickname" value={nick} onChange={setNick} placeholder="ada" maxLength={24} /></View>
      <Divider />
      <View style={k.row}><Icon name="mail" size={20} color={() => theme().ink} /><Text style={[k.body, { color: c.ink, flex: 1 }]}>{tr('Weekly digest')}</Text><Switch value={digest} onValueChange={setDigest} trackColor={{ true: '#e8492a' }} /></View>
      <Divider />
      <View style={k.pad}>
        <Text style={[k.small, { color: c.ink, fontWeight: '600' }]}>Units</Text>
        <Segmented options={['Metric', 'Imperial']} value={units} onChange={setUnits} />
        <Text style={[k.small, { color: c.ink, fontWeight: '600' }]}>{tr('Language')}</Text>
        <Segmented options={['English', 'Français']} value={lang} onChange={setLang} />
        <ActionButton title={tr('Save settings')} icon="check" busy={saving} onPress={save} />
      </View>
    </Section>
  </Screen>;
}

const st = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: SP * 2, padding: SP * 3, borderRadius: 12 },
});
