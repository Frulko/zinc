// One turn-by-turn instruction. Its own module: route.ts and the generated route-data.ts both need it, and a class
// declared in one of two importing modules is not initialised yet (ES module cycle) when the other one runs.
/** One turn-by-turn instruction: the maneuver happens `at` metres from the start. */
export class Step {
  constructor(
    public at: number,
    /** depart | slight | turn | sharp | uturn | roundabout | arrive */
    public type: string,
    /** left | right | '' */
    public side: string,
    /** roundabout exit number */
    public exit: i32,
    /** turn angle in degrees, + = right (roundabouts: from the entry to the exit direction) */
    public angle: number,
    public street: string,
    public text: string,
    /** turn:lanes of the approach ("left|through|through;right"), '' when unknown */
    public lanes: string,
    /** per lane, '1' when it leads to the maneuver */
    public lanesOn: string,
  ) {}
}
