// The starting setup when there is no saved mapping.json: four layers, each a quad placed by its corner pins
// (x, y pairs in 0..1 of the output: top-left, top-right, bottom-right, bottom-left).
import * as mapping from 'zinc:mapping';

/** Creates the demo layers; returns the layer that should show the video (-1 when there is no video). */
export function createDemoLayers(liveImage: i32, withVideo: boolean): i32 {
  const card = mapping.addLayer('pattern', 'test card');
  mapping.set(card, 'corners', [0.05, 0.1, 0.45, 0.14, 0.43, 0.86, 0.07, 0.82]);

  const gradient = mapping.addLayer('gradient', 'gradient');
  mapping.set(gradient, 'corners', [0.55, 0.12, 0.95, 0.08, 0.93, 0.9, 0.57, 0.86]);
  mapping.set(gradient, 'color2', [0.05, 0.05, 0.35]);
  mapping.set(gradient, 'angle', [90]);

  const live = mapping.addLayer('image', 'live');
  mapping.setImage(live, liveImage);
  mapping.set(live, 'corners', [0.38, 0.3, 0.62, 0.3, 0.62, 0.7, 0.38, 0.7]);

  if (!withVideo) return -1;
  // a test card until the player has decoded its first frame (main.ts then binds the player image)
  const video = mapping.addLayer('pattern', 'video');
  mapping.set(video, 'corners', [0.3, 0.62, 0.7, 0.66, 0.68, 0.97, 0.32, 0.93]);
  return video;
}
