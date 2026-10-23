// image/catalog.json: the boards, displays and libraries a profile can name, each with the label shown for it.
import * as fs from 'zinc:fs';

export class Choice {
  key: string = '';
  label: string = '';
}

export class Catalog {
  boards: Choice[] = [];
  displays: Choice[] = [];
  libraries: Choice[] = [];
}

function choicesOf(group: any): Choice[] {
  const choices: Choice[] = [];
  for (const entry of group as any[]) {
    const choice = new Choice();
    choice.key = entry.key as string;
    choice.label = entry.label as string;
    choices.push(choice);
  }
  return choices;
}

/** @throws when the file cannot be read */
export function loadCatalog(path: string): Catalog {
  const parsed: any = JSON.parse(fs.readText(path));
  const catalog = new Catalog();
  catalog.boards = choicesOf(parsed.boards);
  catalog.displays = choicesOf(parsed.displays);
  catalog.libraries = choicesOf(parsed.libraries);
  return catalog;
}

export function labelOf(choices: Choice[], key: string): string {
  for (const choice of choices) if (choice.key === key) return choice.label;
  return key;
}

export function keyOf(choices: Choice[], label: string): string {
  for (const choice of choices) if (choice.label === label) return choice.key;
  return label;
}
