// zinc:levels on macOS (ZN-1075): the LevelIndicator of the spec as an NSLevelIndicator. zinc_views_levels.h, written by `zinc native-gen --views`
// from native/levels.spec.ts, holds the protocol this view implements, its events object and the class the AppKit host mounts for the kind.
#define ZRT_HOSTED_CPP
#import <AppKit/AppKit.h>
#include "zinc_native_levels.h"
#include "zinc_views_levels.h"

@interface ZnLevelView : NSLevelIndicator <ZincLevelIndicatorView>
@end

@implementation ZnLevelView {
  ZincLevelIndicatorEvents* events_;
}
- (instancetype)initWithEvents:(ZincLevelIndicatorEvents*)events {
  if ((self = [super initWithFrame:NSZeroRect])) {
    events_ = events;
    self.minValue = 0;
    self.levelIndicatorStyle = NSLevelIndicatorStyleDiscreteCapacity;
    self.target = self;
    self.action = @selector(changed:);
  }
  return self;
}
- (void)changed:(id)sender { [events_ onChange:self.doubleValue]; }   // the person clicked a level
- (void)updateValue:(double)value { self.doubleValue = value; }
- (void)updateMax:(double)max { self.maxValue = max; }
- (void)updateStyle:(NSString*)style {
  self.levelIndicatorStyle = [style isEqualToString:@"rating"] ? NSLevelIndicatorStyleRating
                           : [style isEqualToString:@"continuous"] ? NSLevelIndicatorStyleContinuousCapacity : NSLevelIndicatorStyleDiscreteCapacity;
}
- (void)updateEditable:(BOOL)editable { self.editable = editable; }
@end

NSView<ZincLevelIndicatorView>* ZincLevelIndicatorMake(ZincLevelIndicatorEvents* events) { return [[ZnLevelView alloc] initWithEvents:events]; }

namespace {
struct MacLevels : NativeLevels {
  bool ok = false;
  bool registered() override { return ok; }
};
}  // namespace

NativeLevels* zinc_create_Levels() {
  static MacLevels m;
  m.rc = zrt::IMMORTAL;
  m.ok = zinc_views_levels_register();
  return &m;
}
