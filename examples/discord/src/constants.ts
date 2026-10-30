// Every literal used twice: endpoints, the client identity, colours and sizes. The endpoints can be moved by env for the tests (a fake
// Discord on 127.0.0.1, tests/t1/discord.sh).
import { env } from 'zinc:sys';
import { v, runColor } from './theme';

const or = (name: string, fallback: string): string => { const v = env(name); return v !== '' ? v : fallback; };

export const API_BASE = or('DISCORD_API', 'https://discord.com/api/v9');
export const GATEWAY_URL = or('DISCORD_GATEWAY', 'wss://gateway.discord.gg');
export const GATEWAY_QUERY = '/?encoding=json&v=9';
export const CDN_BASE = or('DISCORD_CDN', 'https://cdn.discordapp.com');
// QR code login: the remote-auth gateway, which accepts only the web origin, and the link the phone app reads from the code
export const REMOTE_AUTH_URL = or('DISCORD_REMOTE_AUTH', 'wss://remote-auth-gateway.discord.gg/?v=2');
export const WEB_ORIGIN = 'https://discord.com';
export const QR_LINK = 'https://discord.com/ra/';

// One coherent identity, sent in IDENTIFY, in X-Super-Properties and as the User-Agent (docs/reports/discord-client-research.md 2.3).
// ponytail: Chrome and the build number as the web client sent them on 2026-10-30, baked in; DISCORD_BUILD_NUMBER overrides it until it is read from the live web client.
export const BROWSER_VERSION = '156.0.0.0';
export const USER_AGENT = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${BROWSER_VERSION} Safari/537.36`;
export const CLIENT_BUILD_NUMBER = parseInt(or('DISCORD_BUILD_NUMBER', '657850'));
export const LOCALE = 'en-US';
// NO_AFFINE_USER_IDS, VERSIONED_READ_STATES, VERSIONED_USER_GUILD_SETTINGS, DEDUPE_USER_OBJECTS, MULTIPLE_GUILD_EXPERIMENT_POPULATIONS,
// NON_CHANNEL_READ_STATES, CLIENT_STATE_V2: READY in one payload, settings as JSON (no protobuf), no token refresh to persist.
export const CAPABILITIES = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 6) | (1 << 7) | (1 << 10);

export const SECRET_TOKEN_KEY = 'discord-token';
export const MESSAGES_PAGE = 50, OLDER_PAGE = 100;   // the first page of a channel, then the pages before it (100: the API's most)

// Channel types (the API's numbers)
export const CH_TEXT = 0, CH_DM = 1, CH_VOICE = 2, CH_GROUP_DM = 3, CH_CATEGORY = 4, CH_ANNOUNCEMENT = 5, CH_FORUM = 15, CH_MEDIA = 16;
export const CH_ANNOUNCEMENT_THREAD = 10, CH_PRIVATE_THREAD = 12;
export const isThread = (type: i32): boolean => type >= CH_ANNOUNCEMENT_THREAD && type <= CH_PRIVATE_THREAD;

export const RAIL_W = 72, CHANNELS_W = 240, MEMBERS_W = 240, PANE_W = 360;   // PANE_W: the pins or a thread beside the messages

// The theme's colours, as classes (theme.ts: the scheme variables a theme file sets)
export const BG_RAIL = `bg-${v('rail')}`, BG_SIDE = `bg-${v('sidebar')}`, BG_MAIN = `bg-${v('main')}`, BG_INPUT = `bg-${v('input')}`;
export const BG_SELECTED = `bg-${v('selected')}`, BG_HOVER = `hover:bg-${v('hover')}`, BG_ACCENT = `bg-${v('accent')}`;
export const TEXT_MAIN = `text-${v('text')}`, TEXT_MUTED = `text-${v('muted')}`, TEXT_STRONG = `text-${v('strong')}`, TEXT_ERROR = `text-${v('error')}`;

// Writing (docs/reports/discord-client-research.md 2.6 and 3)
export const TYPING_SHOWN_MS = 10000;   // an indicator lasts 10 s (when "typing" is sent: src/safety/policy.ts)
export const DISCORD_EPOCH = 1420070400000;
export const MENTION_BG = `bg-${v('badge')}`, TEXT_MENTION = runColor('mention'), TEXT_LINK = runColor('link'), TEXT_CODE = runColor('text'), SPOILER = runColor('spoiler');

// Pictures (docs/reports/discord-client-research.md 3): the CDN's files are kept on disk (DISCORD_CACHE moves the folder, for the tests)
export const CACHE_DIR = env('DISCORD_CACHE');
export const AVATAR = 40, MEMBER_AVATAR = 32, EMOJI = 22, EMOJI_BIG = 48;
export const MEDIA_MAX_W = 400, MEDIA_MAX_H = 300;

// Voice (call.ts): who speaks has a green ring; the push-to-talk key, held
/** A participant's tile in the call view (a camera is decoded at this size times the pixel scale). */
export const TILE_W = 256, TILE_H = 144;
/** A watched Go Live stream in full view. */
export const FULL_W = 960, FULL_H = 540;
export const VOICE_AVATAR = 20, CALL_AVATAR = 64, SPEAKING_RING = 'border-[#23a55a]', PTT_KEY = 'F8';
export const EMBED_W = 432, THUMB = 80, STICKER = 160;   // an embed card at most, its thumbnail, a sticker
export const ROW_ESTIMATE = 44;           // a message's height before it is laid out (the virtual list's estimate)
export const OLDER_AT = 400;              // px from the top of the history where the page before is asked for
