// zinc:levels where AppKit does not run (Linux, Windows, a stand-in run): no view is registered, so the LevelIndicator draws its cells.
export default {
  registered(): boolean { return false; },
};
