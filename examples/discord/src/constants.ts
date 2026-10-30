// Every literal used twice: endpoints, the client identity, colours and sizes. The endpoints can be moved by env for the tests (a fake
// Discord on 127.0.0.1, tests/t1/discord.sh).
import { env } from 'zinc:sys';

const or = (name: string, fallback: string): string => { const v = env(name); return v !== '' ? v : fallback; };

export const API_BASE = or('DISCORD_API', 'https://discord.com/api/v9');
export const GATEWAY_URL = or('DISCORD_GATEWAY', 'wss://gateway.discord.gg');
export const GATEWAY_QUERY = '/?encoding=json&v=9';
export const CDN_BASE = or('DISCORD_CDN', 'https://cdn.discordapp.com');

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
export const RECONNECT_MAX_MS = 60000;

// Channel types (the API's numbers)
export const CH_TEXT = 0, CH_DM = 1, CH_VOICE = 2, CH_GROUP_DM = 3, CH_CATEGORY = 4, CH_ANNOUNCEMENT = 5, CH_FORUM = 15;

export const RAIL_W = 72, CHANNELS_W = 240, MEMBERS_W = 240;

// Discord's dark theme, as classes
export const BG_RAIL = 'bg-[#1e1f22]', BG_SIDE = 'bg-[#2b2d31]', BG_MAIN = 'bg-[#313338]', BG_INPUT = 'bg-[#383a40]';
export const BG_SELECTED = 'bg-[#404249]', BG_HOVER = 'hover:bg-[#35373c]', BG_ACCENT = 'bg-[#5865f2]';
export const TEXT_MAIN = 'text-[#dbdee1]', TEXT_MUTED = 'text-[#949ba4]', TEXT_STRONG = 'text-[#f2f3f5]', TEXT_ERROR = 'text-[#fa777c]';

// Writing (docs/reports/discord-client-research.md 2.6 and 3)
export const MESSAGE_MAX = 2000;
export const TYPING_EVERY_MS = 8000, TYPING_SHOWN_MS = 10000;   // the web client sends typing every 8 s; an indicator lasts 10 s
export const ACK_DELAY_MS = 300;
export const DISCORD_EPOCH = 1420070400000;
export const MENTION_BG = 'bg-[#f23f43]', TEXT_MENTION = 0xc9cdfb, TEXT_LINK = 0x00a8fc, TEXT_CODE = 0xdbdee1, SPOILER = 0x6d6f78;

// Pictures (docs/reports/discord-client-research.md 3): the CDN's files are kept on disk (DISCORD_CACHE moves the folder, for the tests)
export const CACHE_DIR = env('DISCORD_CACHE');
export const AVATAR = 40, MEMBER_AVATAR = 32, EMOJI = 22, EMOJI_BIG = 48;
export const MEDIA_MAX_W = 400, MEDIA_MAX_H = 300;

// Voice (call.ts): who speaks has a green ring; the push-to-talk key, held
export const VOICE_AVATAR = 20, SPEAKING_RING = 'border-[#23a55a]', PTT_KEY = 'F8';
export const ROW_ESTIMATE = 44;           // a message's height before it is laid out (the virtual list's estimate)
export const OLDER_AT = 400;              // px from the top of the history where the page before is asked for
export const UPLOAD_MAX = 10;             // files in one message
