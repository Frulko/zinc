// Console helper shared by the tour: section headings.

/** Prints a blank line and an underlined heading. */
export function section(title: string): void {
  console.log('');
  console.log(title);
  console.log('-'.repeat(title.length));
}
