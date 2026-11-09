interface Key { id: string; }
interface Track { keys: Key[] | null; }
function track(): Track | undefined { return undefined; }
track()?.keys.find((key: Key) => true);
