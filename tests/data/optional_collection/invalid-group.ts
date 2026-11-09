interface Track { keys: number[]; }
function track(): Track | undefined { return undefined; }
(track()?.keys).find((n: number) => true);
