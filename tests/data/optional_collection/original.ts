interface Key { id: string; }
interface Track { keys: Key[]; }
function track(): Track | undefined { return { keys: [{ id: 'a' }] }; }
const value: Key | undefined = track()?.keys.find((item: Key) => item.id === 'a');
console.log(value?.id);
