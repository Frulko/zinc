interface Props { selected?: () => boolean }
function unsafe(props: Props): string { return String(props.selected()); }
