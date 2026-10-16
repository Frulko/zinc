// The players the Media screen imports as './media'. Platform-specific files (docs/targets/capabilities.md): on macos and linux, media.macos.ts and
// media.linux.ts replace this file with zinc:audio and zinc:video (desktop plugins); every other target gets the silent player and the poster.
export { Track, Clip, openClip } from './media-stub';
