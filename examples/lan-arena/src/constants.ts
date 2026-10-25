// Every literal used twice: the arena, the rules, the network, the colours.

/** The UDP port of a match: discovery, inputs and snapshots (ARENA_PORT overrides it, for the tests). */
export const PORT: i32 = 47800;
/** The first word of every datagram: another program on the port is ignored. */
export const TAG = 'PA1';

// The arena: '#' and the letters are walls (their colour), '.' floor, 'o' a spawn point. 16 x 16 cells of one unit.
export const MAP: string[] = [
  '################',
  '#o....#....R..o#',
  '#.....#....R...#',
  '#..BB.....o....#',
  '#..B......GG...#',
  '#......##......#',
  '#o.....##.....o#',
  '###..........###',
  '#....Y....Y....#',
  '#....Y.o..Y....#',
  '#..............#',
  '#..GG..##..BB..#',
  '#......##......#',
  '#o.....R......o#',
  '#......R.......#',
  '################',
];
/** Wall colours by letter: lit face, then the darker face (y sides). */
export const WALL_LETTERS = '#RGBY';
export const WALL_LIT: u32[] = [0x8a8fb0, 0xe0584f, 0x56c26a, 0x4f86e0, 0xf0c840];
export const WALL_DARK: u32[] = [0x5f6380, 0xa83c35, 0x3a8a4a, 0x355fa8, 0xb08f2a];

export const SKY: u32 = 0x1d2340;
export const SKY_LOW: u32 = 0x2c3560;
export const FLOOR: u32 = 0x3b3a36;
export const FLOOR_NEAR: u32 = 0x54524b;
export const INK: u32 = 0xffffff;
export const INK_DIM: u32 = 0xaab0d0;
export const GOLD: u32 = 0xffcd4a;
export const RED: u32 = 0xff5a5a;

/** The paint of each player, by id modulo 8. */
export const PAINT: u32[] = [0xff4fa0, 0x3fd0ff, 0xffd23f, 0x7cff5a, 0xff8a3d, 0xb47cff, 0xffffff, 0x45e0b0];

// The rules
export const MOVE_SPEED = 3.2;        // units per second
export const STRAFE_SPEED = 2.6;
export const TURN_SPEED = 2.7;        // radians per second
export const RADIUS = 0.22;           // a player against the walls
export const HIT_RADIUS = 0.36;       // a ball against a player
export const BALL_SPEED = 9.0;
export const BALL_LIFE = 1.6;         // seconds
export const FIRE_COOLDOWN = 0.38;
export const RESPAWN_TIME = 1.6;
export const WIN_SCORE: i32 = 10;
export const ROUND_PAUSE = 4.0;       // the winner's screen
export const MAX_PLAYERS: i32 = 8;
export const BOTS_WITH_NOBODY: i32 = 4;   // bots fill the arena up to this many players on a host

// The network
export const SNAPSHOT_MS = 50;        // 20 snapshots a second from the host
export const INPUT_MS = 33;           // 30 inputs a second from a client
export const SEARCH_MS = 700;         // a "who hosts?" broadcast
export const HOST_FORGET_MS = 3000;   // a host that stopped answering leaves the list
export const TIMEOUT_MS = 4000;       // a silent client is dropped, a silent host is left

// The view
export const FOV_PLANE = 0.66;        // the camera plane: about 66 degrees
export const FOG_DISTANCE = 14.0;
