// Opening a link in the system's browser. zinc:system (React Native's Linking here) is a desktop plugin: links.macos.ts and links.linux.ts bring
// it; elsewhere openLink says so instead of failing.
export function openLink(url: string): Promise<void> { return Promise.reject(new Error('links open in the desktop build')); }
