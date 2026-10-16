// The feed the Network screen imports as './feed'. Platform-specific files (docs/targets/capabilities.md): on macos and linux, feed.macos.ts and
// feed.linux.ts replace this file and bring a real WebSocket (zinc:socket, a desktop plugin); every other target gets the in-app mock.
export { FeedMessage, MockFeed as Feed } from './feed-mock';
