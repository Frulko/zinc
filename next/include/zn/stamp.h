#pragma once
// ZINC_STAMP_OUT (the simulator runner, ZN-295.01): every line the program writes to its standard output starts with "@<frames done> ", so a runner that replays a deterministic run
// knows at which frame (hence at which virtual time) the program said it.
namespace zn::rt {
inline int gStampFrame = 0;   // frames presented so far; set by the host's frame loop
}
