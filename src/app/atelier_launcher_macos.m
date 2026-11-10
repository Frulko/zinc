#import <AppKit/AppKit.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

typedef NS_ENUM(NSUInteger, LauncherState) { Starting, Running, Stopping };

static NSArray<NSString *> *atelierArguments(NSString *engine) {
    NSDictionary *env = NSProcessInfo.processInfo.environment;
    NSString *project = [env[@"ZINC_PROJECT"] length] ? env[@"ZINC_PROJECT"] : [(env[@"HOME"] ?: NSHomeDirectory()) stringByAppendingPathComponent:@"Zinc"];
    NSError *error = nil;
    if (![NSFileManager.defaultManager createDirectoryAtPath:project withIntermediateDirectories:YES attributes:nil error:&error]) {
        fprintf(stderr, "Zinc Atelier: %s\n", error.localizedDescription.UTF8String);
        return nil;
    }
    NSString *hello = [project stringByAppendingPathComponent:@"hello.ts"];
    int fd = open(hello.fileSystemRepresentation, O_WRONLY | O_CREAT | O_EXCL, 0644);
    if (fd >= 0) {
        const char text[] = "console.log(\"hello from Zinc\");\n";
        ssize_t written = write(fd, text, sizeof(text) - 1);
        int closed = close(fd);
        if (written != sizeof(text) - 1 || closed != 0) { perror("Zinc Atelier: hello.ts"); return nil; }
    } else if (errno != EEXIST) { perror("Zinc Atelier: hello.ts"); return nil; }
    NSString *source = [[engine stringByDeletingLastPathComponent] stringByAppendingPathComponent:@"../Resources/zinc/app/atelier/main.tsx"];
    return @[@"run", source, @"--", project];
}

@interface ZincLauncher : NSObject <NSApplicationDelegate>
@property LauncherState state;
@property NSString *engine;
@property NSMutableArray<NSTask *> *children;
@end

@implementation ZincLauncher
- (BOOL)transition:(LauncherState)next {
    if (!((_state == Starting && next == Running) || (_state == Running && next == Stopping))) return NO;
    _state = next;
    return YES;
}
- (void)finishIfEmpty {
    if (_children.count || _state == Starting) return;
    if (_state == Stopping) [NSApp replyToApplicationShouldTerminate:YES];
    else { [self transition:Stopping]; [NSApp terminate:nil]; }
}
- (BOOL)launch:(NSArray<NSString *> *)arguments {
    if (!arguments || _state == Stopping) return NO;
    NSTask *task = [NSTask new];
    task.executableURL = [NSURL fileURLWithPath:_engine];
    task.arguments = arguments;
    __weak ZincLauncher *owner = self;
    task.terminationHandler = ^(NSTask *ended) {
        dispatch_async(dispatch_get_main_queue(), ^{
            ZincLauncher *launcher = owner;
            [launcher.children removeObjectIdenticalTo:ended];
            [launcher finishIfEmpty];
        });
    };
    NSError *error = nil;
    if (![task launchAndReturnError:&error]) {
        fprintf(stderr, "Zinc Atelier: %s\n", error.localizedDescription.UTF8String);
        return NO;
    }
    [_children addObject:task];
    return YES;
}
- (void)application:(NSApplication *)application openFiles:(NSArray<NSString *> *)files {
    // The initial open event precedes didFinishLaunching: it replaces the Atelier fallback.
    if (_state == Starting) [self transition:Running];
    BOOL success = _state == Running;
    for (NSString *path in files) if (![self launch:@[@"run", path]]) success = NO;
    [application replyToOpenOrPrint:success ? NSApplicationDelegateReplySuccess : NSApplicationDelegateReplyFailure];
    if (application.isRunning) [self finishIfEmpty];
}
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    (void)notification;
    if (_state == Starting) { [self transition:Running]; [self launch:atelierArguments(_engine)]; }
    [self finishIfEmpty];
}
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)application {
    (void)application;
    if (_children.count == 0) return NSTerminateNow;
    if (_state == Running) [self transition:Stopping];
    for (NSTask *task in [_children copy]) if (task.running) [task terminate];
    return NSTerminateLater;
}
@end

int main(int argc, const char **argv) {
    @autoreleasepool {
        NSString *engine = [[NSBundle.mainBundle.executablePath stringByDeletingLastPathComponent] stringByAppendingPathComponent:@"zinc"];
        NSDictionary *env = NSProcessInfo.processInfo.environment;
        if ((argc > 1 && strncmp(argv[1], "-psn_", 5) != 0) || [env[@"ZINC_HEADLESS"] isEqualToString:@"1"]) {
            NSArray *arguments;
            if (argc > 1) {
                NSMutableArray *paths = [NSMutableArray arrayWithObject:@"run"];
                for (int i = 1; i < argc; ++i) [paths addObject:[NSString stringWithUTF8String:argv[i]]];
                arguments = paths;
            } else arguments = atelierArguments(engine);
            if (!arguments) return 1;
            char **args = calloc(arguments.count + 2, sizeof(char *));
            args[0] = (char *)engine.fileSystemRepresentation;
            for (NSUInteger i = 0; i < arguments.count; ++i) args[i + 1] = (char *)[arguments[i] UTF8String];
            execv(args[0], args);
            perror("Zinc Atelier: zinc");
            free(args);
            return 1;
        }
        NSApplication *app = NSApplication.sharedApplication;
        [app setActivationPolicy:NSApplicationActivationPolicyProhibited];
        ZincLauncher *launcher = [ZincLauncher new];
        launcher.engine = engine;
        launcher.children = [NSMutableArray new];
        app.delegate = launcher;
        [app run];
    }
    return 0;
}
