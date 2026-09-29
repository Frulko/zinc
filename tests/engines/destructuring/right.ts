interface State { value: i32; label: string }
function make(): State { console.log('right init'); return { value: 8, label: 'right' }; }
export const { value, label } = make();
