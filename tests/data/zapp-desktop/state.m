#define main zinc_launcher_main
#import "../../../src/app/atelier_launcher_macos.m"
#undef main
#include <assert.h>

int main(void) {
    @autoreleasepool {
        ZincLauncher *launcher = [ZincLauncher new];
        launcher.children = [NSMutableArray new];
        launcher.engine = @"/usr/bin/false";
        assert(![launcher transition:Stopping]);
        assert([launcher transition:Running]);
        assert(![launcher transition:Running]);
        assert([launcher launch:@[]]);
        [[launcher.children firstObject] waitUntilExit];
        NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:2];
        while (launcher.children.count && deadline.timeIntervalSinceNow > 0)
            [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.01]];
        assert(launcher.children.count == 0 && launcher.state == Stopping);
        assert(![launcher launch:@[]]);
        assert(![launcher transition:Running]);
        ZincLauncher *failed = [ZincLauncher new];
        failed.children = [NSMutableArray new];
        failed.engine = @"/nonexistent/zinc";
        [failed application:nil openFiles:@[@"/archive.zapp"]];
        assert(failed.state == Running && failed.children.count == 0);
        [failed applicationDidFinishLaunching:nil];
        assert(failed.state == Stopping && failed.children.count == 0);
    }
    return 0;
}
