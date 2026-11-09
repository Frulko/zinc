interface Props { selected?: () => boolean }
function unsafe(props: Props): string {
  if (props.selected !== undefined) { props.selected = undefined; return String(props.selected()); }
  return '';
}
