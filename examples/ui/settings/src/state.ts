import * as ui from 'zinc:ui';
import { createSignal, onCleanup } from 'zinc:ui/solid';
import { setTheme, setThemeAccent, LIGHT, DARK } from 'zinc:ui/kit';
import { env } from 'zinc:sys';
import { URL } from 'zinc:web';

export interface Preferences {
  first: string; last: string; email: string; username: string; website: string; bio: string;
  timezone: string; language: string;
  comments: boolean; mentions: boolean; digest: boolean; desktop: boolean; push: string;
  scheme: string; accent: string; reducedMotion: boolean;
}
export interface Settings {
  draft: () => Preferences;
  edit: (next: Preferences) => void;
  dirty: () => boolean;
  error: (field: string) => string;
  section: () => string;
  navigate: (section: string) => void;
  save: () => void;
  discard: () => void;
  notice: () => string;
}
export const sections: string[] = ['Profile', 'Notifications', 'Appearance', 'Account'];

/** The snapshot belongs to this window; no files or real accounts are touched. */
export function createSettings(): Settings {
  const systemMotion = ui.prefersReducedMotion();
  const initial: Preferences = {
    first: 'Alex', last: 'Morgan', email: 'alex@example.test', username: 'alex.morgan',
    website: 'https://example.test', bio: 'Designer, field notes collector and weekend maker.',
    timezone: 'Europe/Paris', language: 'English', comments: true, mentions: true, digest: false,
    desktop: false, push: 'mentions', scheme: env('SETTINGS_DARK') === '1' ? 'dark' : 'light',
    accent: 'neutral', reducedMotion: systemMotion,
  };
  const [draft, setDraft] = createSignal<Preferences>(initial);
  const [saved, setSaved] = createSignal<Preferences>({ ...initial });
  const [section, navigate] = createSignal('Profile');
  const [notice, setNotice] = createSignal('Changes stay in this window.');
  const applyAppearance = (value: Preferences): void => {
    setTheme(value.scheme === 'dark' ? DARK : LIGHT);
    setThemeAccent(value.accent);
    ui.systemSignal('reducemotion ' + (value.reducedMotion ? '1' : '0'));
  };
  applyAppearance(initial);
  onCleanup(() => ui.systemSignal('reducemotion ' + (systemMotion ? '1' : '0')));
  const dirty = (): boolean => JSON.stringify(draft()) !== JSON.stringify(saved());
  const error = (field: string): string => {
    const d = draft();
    if (field === 'first' && (d.first.trim() === '' || d.first.length > 64)) return 'Enter a first name, up to 64 characters.';
    if (field === 'last' && (d.last.trim() === '' || d.last.length > 64)) return 'Enter a last name, up to 64 characters.';
    if (field === 'email' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) || d.email.length > 96)) return 'Enter an email such as alex@example.test.';
    if (field === 'username' && (d.username.length < 3 || d.username.length > 32 || !/^[a-zA-Z0-9._-]+$/.test(d.username))) return 'Use 3–32 letters, numbers, dots, hyphens or underscores.';
    if (field === 'website' && d.website !== '') {
      const url = URL.parse(d.website);
      if (url === null || url.protocol !== 'https:' || url.hostname === '' || /\s/.test(d.website) || d.website.length > 160) return 'Use an https:// address, or leave this empty.';
    }
    if (field === 'bio' && d.bio.length > 280) return 'Keep your bio under 280 characters.';
    return '';
  };
  return {
    draft, dirty, error, section, navigate, notice,
    edit: (next: Preferences): void => {
      const previous = draft();
      setDraft(next);
      if (previous.scheme !== next.scheme || previous.accent !== next.accent || previous.reducedMotion !== next.reducedMotion) applyAppearance(next);
      setNotice(dirty() ? 'Unsaved changes' : 'All changes saved locally');
    },
    save: (): void => {
      for (const field of ['first', 'last', 'email', 'username', 'website', 'bio']) {
        if (error(field) !== '') { navigate('Profile'); setNotice('Check the highlighted profile fields before saving.'); return; }
      }
      setSaved({ ...draft() });
      setNotice('Saved in this window. Closing it resets the demo.');
    },
    discard: (): void => {
      setDraft({ ...saved() });
      applyAppearance(saved());
      setNotice('Changes discarded. Your last saved settings are restored.');
    },
  };
}
