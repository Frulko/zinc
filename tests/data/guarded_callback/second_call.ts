interface Props { selected?: () => boolean }
function unsafe(props: Props): string {
  if (props.selected !== undefined) { String(props.selected()); return String(props.selected()); }
  return '';
}
