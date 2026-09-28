// Console helpers shared by the tour: section headings and aligned "label  value" lines.

/** Prints a blank line and an underlined heading. */
export function section(title: string): void {
  console.log('');
  console.log(title);
  console.log('-'.repeat(title.length));
}

/** Prints `label` padded to a column, then the value: "fruits      3". */
export function line(label: string, value: string): void {
  console.log(`${label.padEnd(12, ' ')}${value}`);
}
