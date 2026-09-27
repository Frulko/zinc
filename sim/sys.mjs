// zinc:sys for sim
export const args = () => process.argv.slice(2);
export const env = name => process.env[name] ?? '';
export const exit = code => process.exit(code);
export const platform = () => 'sim';
export const clock = () => performance.now();
export const liveObjects = () => 0;
export const allocations = () => 0;
