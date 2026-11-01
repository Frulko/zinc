// Every shared number of the game. Rules read them from here; nothing else hides a magic value.

// ---- map ----
export const DEFAULT_SIZE = 24;         // tiles per side of a new village (the size itself is world.size, saved with the village)
export const MIN_SIZE = 12;             // smallest and largest village a seed may ask for
export const MAX_SIZE = 32;
export const TILE = 2;                  // world units per tile
export const REFERENCE_AREA = 144;      // the 12 x 12 map the counts below were tuned on; they scale with the area
export const GATE_I = 0;                // the entrance is on this column, in the middle of it: where settlers arrive
export const TERRAIN_GRASS = 0;
export const TERRAIN_WATER = 1;
export const TERRAIN_VOID = 2;          // the dissolved border of the diorama: not playable

// ---- buildings and tools ----
// What the buildings are (names, costs, jobs) is data: assets/economy.json. A building type is its index in that file; a tool places the type TOOL_HOUSE + type.
export const HOUSE = 0;                 // the first building of the file is always the house
export const TOOL_ROAD = 0;
export const TOOL_HOUSE = 1;
export const TOOL_ERASE = 100;
export const TOOL_NONE = -1;            // nothing selected (Escape): clicks place nothing
export const PLACE_OK = 0;
export const PLACE_BLOCKED = 1;
export const PLACE_NO_ROAD = 2;
export const PLACE_NO_STOCK = 3;
export const PLACE_NO_WATER = 4;

// ---- time ----
export const TICK = 1 / 32;             // the simulation advances in whole ticks of this many seconds: the same ticks give the same village

// ---- economy ----
export const SETTLER_INTERVAL = 6;      // seconds between two arrivals at one house
export const WORK_RADIUS = 14;          // path cost a worker accepts to reach a tree or a deer

// ---- people ----
export const ROLE_SETTLER = 0;
export const ROLE_RESIDENT = 1;
export const ROLE_LUMBERJACK = 2;
export const ROLE_HUNTER = 3;
export const ROLE_FISHER = 4;
export const ROLE_SAWYER = 5;
export const ROLE_SMOKER = 6;
export const ROLE_PORTER = 7;
/** The job names economy.json may give (index = ROLE_*). */
export const ROLE_NAMES: string[] = ['settler', 'resident', 'lumberjack', 'hunter', 'fisher', 'sawyer', 'smoker', 'porter'];
export const WALK_SPEED = 2.1;          // world units per second
export const ROAD_SPEED = 1.35;         // multiplier on a road
export const ROAD_COST = 0.6;           // path cost of a road tile (grass is 1)
export const AIM_SECONDS = 0.8;
export const ARROW_SECONDS = 0.28;
export const SHOOT_RANGE = 5.5;
export const HIT_CHANCE = 0.8;
export const ST_IDLE = 0;
export const ST_STROLL = 1;
export const ST_GO_WORK = 2;
export const ST_SEEK = 3;
export const ST_TO_TREE = 4;
export const ST_CHOP = 5;
export const ST_TO_SITE = 6;
export const ST_STALK = 7;
export const ST_AIM = 8;
export const ST_SHOT = 9;
export const ST_TO_BODY = 10;
export const ST_PICK = 11;
export const ST_WALK_IN = 12;
export const ST_TO_SHORE = 13;
export const ST_FISH = 14;
export const ST_WORK = 15;             // a processing building's worker at work
export const ST_FETCH = 16;            // walking to where a load lies
export const ST_BRING = 17;            // carrying a load to where it is needed
export const BS_IDLE = 0;              // building states: what its workers are doing, for the hints
export const BS_WORKING = 1;
export const BS_WAITING = 2;          // an input is missing (Building.waitFor)
export const BS_FULL = 3;              // the output has no room
export const BS_ISOLATED = 4;          // no road leads from it to a store: nothing leaves it (and nothing comes)
export const BATCH = 4;                // most a porter carries at once
export const FISH_CATCH_CHANCE = .85;

// ---- no-limit mode: nature refills itself below a threshold ----
export const TREE_MIN = 18;             // below this many trees, one grows back every TREE_REGROW seconds
export const TREE_REGROW = 10;

// ---- deer ----
export const DEER_START = 5;
export const DEER_MIN = 4;
export const DEER_RESPAWN = 30;
export const DEER_SPEED = 1.0;
export const DEER_FLEE_SPEED = 3.4;
export const DEER_GRAZE = 0;
export const DEER_WALK = 1;
export const DEER_FLEE = 2;
export const DEER_DEAD = 3;
export const DEER_GONE = 4;             // free slot

// ---- save ----
export const SAVE_KEY = 'hamlet:save';
export const SAVE_VERSION = 'H7';
export const SAVE_DELAY = 2;            // seconds between two writes
