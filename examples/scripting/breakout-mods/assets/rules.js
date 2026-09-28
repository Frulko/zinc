// A breakout mod (examples/scripting/breakout-mods). The game calls these functions through zinc:script; delete one
// and the game's own rule applies again. Edit this file and restart the game (in `zinc dev`, assets reload from disk).

// Faster serves, climbing 40 px/s per level.
export function serveSpeed(level) {
  return 170 + (level - 1) * 40;
}

// Each brick speeds the ball up by 2 %, up to 420 px/s.
export function speedUp(speed) {
  return Math.min(speed * 1.02, 420);
}

// Combo scoring: the n-th brick since the ball left the paddle is worth (n + 1) times its points, up to x5.
export function points(base, level, combo) {
  const multiplier = 1 + Math.min(combo, 4);
  if (combo === 4) log(`combo x${multiplier}!`);
  return base * multiplier;
}

log('rules.js loaded: faster serves, combo scoring');
