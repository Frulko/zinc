#import "ios_feedback_store.h"
#include <cassert>

int main(int argc, char** argv) {
  @autoreleasepool {
    NSURL* root = [NSURL fileURLWithPath:@(argv[1]) isDirectory:YES];
    NSDictionary* first = @{@"app": @"Minuit/../manoir 🔎", @"deviceID": @"ios-test", @"device": @{@"screenPixels": @{@"width": @1206, @"height": @2622}}};
    NSError* error = nil;
    assert(!zn_feedback_save(root, first, @" \n ", &error) && error);
    NSURL* a = zn_feedback_save(root, first, @"Le bouton ne répond pas.\nDeuxième ligne 🔎", &error);
    NSURL* b = zn_feedback_save(root, first, @"Autre retour", &error);
    NSURL* c = zn_feedback_save(root, @{@"app": @"other"}, @"Note séparée", &error);
    assert(a && b && c && ![a isEqual:b]);
    assert([a.URLByDeletingLastPathComponent isEqual:b.URLByDeletingLastPathComponent]);
    assert(![a.URLByDeletingLastPathComponent isEqual:c.URLByDeletingLastPathComponent]);
    assert([a.path hasPrefix:[[root URLByAppendingPathComponent:@"feedback"] path]]);
    NSDictionary* stored = [NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfURL:a] options:0 error:&error];
    assert([stored[@"note"] isEqual:@"Le bouton ne répond pas.\nDeuxième ligne 🔎"]);
    assert([stored[@"app"] isEqual:first[@"app"]] && [stored[@"device"] isEqual:first[@"device"]]);
    assert([stored[@"schema"] isEqual:@1]);
    assert([[NSISO8601DateFormatter new] dateFromString:stored[@"timestamp"]]);
    NSURL* blocked = [root URLByAppendingPathComponent:@"file"];
    [@"keep" writeToURL:blocked atomically:YES encoding:NSUTF8StringEncoding error:&error];
    error = nil;
    assert(!zn_feedback_save(blocked, first, @"Cannot save here", &error) && error);
    assert([[NSString stringWithContentsOfURL:blocked encoding:NSUTF8StringEncoding error:nil] isEqual:@"keep"]);
  }
}
