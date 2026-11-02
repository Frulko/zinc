// Every shared number of the game. Rules read them from here; nothing else hides a magic value.

// ---- map ----
export const DEFAULT_SIZE = 24;         // tiles per side of a new village (the size itself is world.size, saved with the village)
export const MIN_SIZE = 12;             // smallest and largest village a seed may ask for
export const MAX_SIZE = 256;
export const HEIGHT_STEP = 0.5;        // world units per height level
export const MAX_HEIGHT = 15;          // levels 0..15 per tile; water only at 0
export const MOUNTAIN_LEVEL = 8;       // from this level the ground is rock: no building, no road, no walking
export const SLOPE_COST = 1.5;         // a road laid on a slope costs this much more, a walker's path through one is this much dearer
export const SLOPE_SPEED = 0.7;        // walking speed multiplier on a step that climbs or descends a level
export const TILE = 2;                  // world units per tile
export const REFERENCE_AREA = 144;      // the 12 x 12 map the counts below were tuned on; they scale with the area
export const GATE_I = 0;                // the entrance is on this column, in the middle of it: where settlers arrive
export const TERRAIN_GRASS = 0;
export const TERRAIN_WATER = 1;
export const TERRAIN_VOID = 2;          // the dissolved border of the diorama: not playable

// ---- deposits: a tile object a gatherer can work. world.rock holds it as ROCK_DEPOSIT + the deposit kind; world.lode what is left ----
export const ROCK_DEPOSIT = 3;          // rock values 1 and 2 are plain rocks
/** The art of each deposit kind (variants of the rock model, after the two plain rocks): the `model` of a deposit in economy.json. */
export const DEPOSIT_MODELS: string[] = ['stone', 'clay', 'ore', 'berries'];
export const LODE_REACH = 12;          // a required deposit lies within this many tiles of the gate
export const ROCK_VARIANTS = 2 + DEPOSIT_MODELS.length;

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
export const PLACE_LOCKED = 6;         // the building is unlocked by a goal not yet reached
export const PLACE_UNEVEN = 7;        // the footprint is not flat: a slope, or a cliff beside it
export const PLACE_ROCKY = 8;          // mountain rock (level MOUNTAIN_LEVEL and up): nothing is built there
export const PLACE_NO_LODE = 5;        // a gatherer of a deposit with none of its kind near

// ---- time ----
export const TICK = 1 / 32;             // the simulation advances in whole ticks of this many seconds: the same ticks give the same village

// ---- the day: the slice of the simulation that runs once a day (counters decay, houses evolve, goals are checked) ----
export const DAY_SECONDS = 20;
export const DAY_TICKS = DAY_SECONDS * 32;
export const COVER_DAYS = 3;         // days a walker's visit (or a well's reach) keeps a house covered
export const ROAM_REST = 4;           // seconds a service walker rests at home between two rounds

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
export const ROLE_FARMER = 8;
export const ROLE_MILLER = 9;
export const ROLE_BAKER = 10;
export const ROLE_VENDOR = 11;
export const ROLE_TANNER = 12;
export const ROLE_QUARRYMAN = 13;
export const ROLE_PEDDLER = 14;
export const ROLE_FORAGER = 15;
export const ROLE_SMITH = 16;
export const ROLE_BEEKEEPER = 17;
export const ROLE_CHANDLER = 18;
export const ROLE_BREWER = 19;
export const ROLE_INNKEEPER = 20;
export const ROLE_FIREWARDEN = 21;
export const ROLE_REPAIRMAN = 22;
export const ROLE_WATCHMAN = 23;
export const ROLE_ROBBER = 24;         // outlaws live in world.crime.outlaws, not in world.people (engine/crime.ts)
export const ROLE_RIOTER = 25;
/** The job names economy.json may give (index = ROLE_*). */
export const ROLE_NAMES: string[] = ['settler', 'resident', 'lumberjack', 'hunter', 'fisher', 'sawyer', 'smoker', 'porter', 'farmer', 'miller', 'baker', 'vendor', 'tanner', 'quarryman', 'peddler', 'forager', 'smith', 'beekeeper', 'chandler', 'brewer', 'innkeeper', 'firewarden', 'repairman', 'watchman'];
export const WALK_SPEED = 2.1;          // world units per second
export const ROAD_SPEED = 1.35;         // multiplier on a road
export const ROAD_COST = 0.6;           // path cost of a road tile (grass is 1)
export const AIM_SECONDS = 0.8;
export const ARROW_SECONDS = 0.28;
export const SHOOT_RANGE = 5.5;
export const STALK_CROUCH = 9;          // a hunter this close to his quarry creeps (slower, low): engine/villagers.ts and the view
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
export const ST_ROAM = 18;             // a service walker on its round of the roads
export const ST_ROAM_BACK = 19;
export const ST_TO_LODE = 20;          // walking to a deposit
export const ST_MINE = 21;             // working it        // ... on its way home
export const ST_SLEEP = 22;            // asleep at home (not drawn): night, rules/needs.ts
export const ST_HOME = 23;             // walking home for the night
export const ST_FREE = 24;             // walking to the market, the well or the tavern in free time
export const ST_RAID = 25;             // an outlaw on his way to the building he will rob or wreck
export const ST_WRECK = 26;            // rioters at work on a building
export const ST_FLEE = 27;             // an outlaw running back to the gate
export const ORDER_ACCEPT = 0, ORDER_REFUSE = 1, ORDER_GET = 2;   // what a store does with a resource (rules/storage.ts)
export const BS_IDLE = 0;              // building states: what its workers are doing, for the hints
export const BS_WORKING = 1;
export const BS_WAITING = 2;          // an input is missing (Building.waitFor)
export const BS_FULL = 3;              // the output has no room
export const BS_ISOLATED = 4;          // no road leads from it to a store: nothing leaves it (and nothing comes)
export const BS_OFF_NET = 6;          // its road does not lead to the entrance: not part of the village, idle (engine/network.ts)
export const BS_NO_SOURCE = 5;         // a gatherer finds nothing within reach (no tree, deposit, shore or game): the road or the ground must change
export const BATCH = 4;                // most a porter carries at once

// ---- no-limit mode: nature refills itself below a threshold ----
export const TREE_MIN = 18;             // below this many trees, one grows back every TREE_REGROW seconds
export const TREE_REGROW = 10;
export const TREE_REGROW_SLOW = 4;     // normal mode: seconds between two new trees (the forest recovers, slowly) ...
export const TREE_CAP_SLOW = 1.5;      // ... up to this many times the no-limit threshold

// ---- deer ----
export const DEER_START = 5;
export const ANIMAL_CAP = 1500;         // the most animals a map places at the start, whatever its size
export const DEER_MIN = 4;
export const DEER_RESPAWN = 30;
export const DEER_SPEED = 1.0;
export const DEER_FLEE_SPEED = 3.4;
export const DEER_GRAZE = 0;
export const DEER_WALK = 1;
export const DEER_FLEE = 2;
export const DEER_DEAD = 3;
export const DEER_GONE = 4;             // free slot
export const DEER_REST = 5;             // lying up: night, or the long rest between two moves
export const DEER_DRINK = 6;            // at the water's edge
export const DEER_ALERT = 7;            // head up, frozen: someone is near (a hunter being stalked stands here until the shot)
export const DEER_STALK = 9;            // a wolf creeping up on its prey, low and slow
export const DEER_CHASE = 10;           // a wolf running its prey down
export const DEER_EAT = 11;             // at a carcass
export const DEER_HOWL = 12;            // a wolf with its head up, at night
export const DEER_CHARGE = 8;           // a cornered boar runs at the person, a moment before it runs away

// ---- save ----
export const SAVE_KEY = 'hamlet:save';
export const SAVE_VERSION = 'H22';
export const SAVE_DELAY = 2;            // seconds between two writes
