// zinc:levels native side (ZN-1075): a module with one member, and the component it adds to the AppKit host. `zinc native-gen --views` writes the
// component's Objective-C++ glue (zinc_views_levels.h) from the interface that extends NativeComponent: a protocol of prop setters that
// native/levels.macos.mm implements with an NSLevelIndicator, and the events object it calls.
import { NativeModule, NativeComponent, requireNative } from 'zinc:native';

/** AppKit's level indicator: a row of cells, stars or a bar. */
export interface LevelIndicator extends NativeComponent {
  /** The level shown, from 0 to max. */
  value: f64;
  /** The highest level (the number of cells or stars). */
  max: f64;
  /** 'discrete' (cells), 'continuous' (a bar) or 'rating' (stars). */
  style: string;
  /** Whether the person sets the level by clicking it. */
  editable: boolean;
  /** The person set the level. */
  onChange: (value: f64) => void;
}

export interface Spec extends NativeModule {
  /** Whether the plugin's views are registered for a native host to mount (false where none can run: they are drawn). */
  registered(): boolean;
}
export default requireNative<Spec>('Levels');
