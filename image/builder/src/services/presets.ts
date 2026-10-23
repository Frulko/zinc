import { decodeProfile, readProfileText, savePrivateText } from './profile';

export class Preset {
  name: string;
  text: string;
  constructor(name: string, text: string) { this.name = name; this.text = text; }
}

export function loadPresets(path: string): Preset[] {
  const text = readProfileText(path);
  if (text.trim() === '') return [];
  const items: any = JSON.parse(text);
  if (!Array.isArray(items)) throw new Error('The presets file must contain a list.');
  const result: Preset[] = [];
  for (const item of items as any[]) {
    if (item === null || typeof item.name !== 'string' || (item.name as string).trim() === '') throw new Error('A preset has no name.');
    const snapshot = JSON.stringify(item.profile);
    decodeProfile(snapshot);
    result.push(new Preset(item.name as string, snapshot));
  }
  return result;
}

export function addPreset(path: string, name: string, snapshot: string): Preset[] {
  const label = name.trim();
  if (label === '' || label.length > 80) throw new Error('Give the preset a name of 1 to 80 characters.');
  decodeProfile(snapshot);
  const presets = loadPresets(path);
  for (const preset of presets) if (preset.name === label) throw new Error('This name already exists. Choose another name.');
  presets.push(new Preset(label, snapshot));
  const rows: any[] = [];
  for (const preset of presets) {
    const row: any = JSON.parse('{}');
    row.name = preset.name;
    row.profile = JSON.parse(preset.text);
    rows.push(row);
  }
  savePrivateText(path, JSON.stringify(rows) + '\n');
  return presets;
}
