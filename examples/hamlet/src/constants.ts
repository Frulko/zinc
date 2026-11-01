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
export const HOUSE = 0;
export const SAWMILL = 1;
export const LODGE = 2;                 // hunting lodge
export const FISHERY = 3;               // fishing hut: stands on the shore of a pond
export const BUILDING_NAMES: string[] = ['Maison', 'Scierie', 'Atelier de chasse', 'Atelier de pêche'];
export const BUILDING_COST: number[] = [5, 8, 8, 8];   // wood
export const TOOL_ROAD = 0;
export const TOOL_HOUSE = 1;
export const TOOL_SAWMILL = 2;
export const TOOL_LODGE = 3;
export const TOOL_FISHERY = 4;
export const TOOL_ERASE = 5;
export const TOOL_NONE = -1;          // nothing selected (Escape): clicks place nothing
export const TOOL_LABELS: string[] = ['Route', 'Maison', 'Scierie', 'Atelier de chasse', 'Atelier de pêche', 'Démolir'];
export const HOUSE_CAPACITY = 2;
export const WORKERS_PER_SITE = 2;
export const PLACE_OK = 0;
export const PLACE_BLOCKED = 1;
export const PLACE_NO_ROAD = 2;
export const PLACE_NO_WOOD = 3;
export const PLACE_NO_WATER = 4;

// ---- time ----
export const TICK = 1 / 32;             // the simulation advances in whole ticks of this many seconds: the same ticks give the same village

// ---- economy ----
export const START_WOOD = 24;
export const SETTLER_INTERVAL = 6;      // seconds between two arrivals at one house
export const FREE_SETTLERS = 4;         // the first inhabitants come without game; later ones want meat
export const MEAT_PER_DEER = 3;
export const WORK_RADIUS = 14;          // path cost a worker accepts to reach a tree or a deer

// ---- people ----
export const ROLE_SETTLER = 0;
export const ROLE_RESIDENT = 1;
export const ROLE_LUMBERJACK = 2;
export const ROLE_HUNTER = 3;
export const ROLE_FISHER = 4;
/** Which job a workplace gives (index: building type; -1 for a house). Add a building, add its role here. */
export const ROLE_OF_BUILDING: number[] = [-1, ROLE_LUMBERJACK, ROLE_HUNTER, ROLE_FISHER];
export const WALK_SPEED = 2.1;          // world units per second
export const ROAD_SPEED = 1.35;         // multiplier on a road
export const ROAD_COST = 0.6;           // path cost of a road tile (grass is 1)
export const CHOP_SECONDS = 2.6;
export const AIM_SECONDS = 0.8;
export const ARROW_SECONDS = 0.28;
export const SHOOT_RANGE = 5.5;
export const HIT_CHANCE = 0.8;
export const PICK_SECONDS = 1;
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
export const FISH_SECONDS = 4.5;
export const FISH_CATCH_CHANCE = .85;
export const FISH_PER_CATCH = 2;

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
export const SAVE_VERSION = 'H5';
export const SAVE_DELAY = 2;            // seconds between two writes
