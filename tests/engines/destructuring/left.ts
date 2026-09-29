interface State { value: i32; label: string }
function make(): State { console.log('left init'); return { value: 3, label: 'left' }; }
export let { value, label } = make();
export function bump(): i32 { value++; return value; }
export function read(): string { return label + ':' + value; }
