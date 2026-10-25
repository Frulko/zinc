#import <AppKit/AppKit.h>
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/core/object.hpp>
#include <godot_cpp/godot.hpp>
#include <godot_cpp/classes/object.hpp>
#include <godot_cpp/variant/string_name.hpp>
#include "zn/app.h"
#include "zn/embed.h"
#include "rt/rt.h"
#include <dlfcn.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <chrono>

using namespace godot;
static std::string pending;
static bool closed = false;
static GDExtensionInterfaceGetProcAddress godot_proc = nullptr;
static void command(const char* text, size_t length, bool) {
  constexpr char prefix[] = "libgodot:";
  if (length <= sizeof(prefix)-1 || length > 32 || std::memcmp(text,prefix,sizeof(prefix)-1)) return;
  std::string action(text+sizeof(prefix)-1,length-sizeof(prefix)+1);
  if (action == "pause" || action == "reset" || action == "faster") pending = action;
}
static void initialize(ModuleInitializationLevel) {}
static GDExtensionBool initialize_godot(GDExtensionInterfaceGetProcAddress proc, GDExtensionClassLibraryPtr library, GDExtensionInitialization* init) {
  godot_proc = proc;
  GDExtensionBinding::InitObject binding(proc,library,init);
  binding.register_initializer(initialize);
  binding.set_minimum_library_initialization_level(MODULE_INITIALIZATION_LEVEL_CORE);
  return binding.init();
}
static Object* singleton(const char* name) {
  auto get = reinterpret_cast<GDExtensionInterfaceGlobalGetSingleton>(godot_proc("global_get_singleton"));
  StringName key(name);
  return internal::get_object_instance_binding(get(key._native_ptr()));
}
@interface RallyWindowDelegate : NSObject<NSWindowDelegate>
@end
@implementation RallyWindowDelegate
- (BOOL)windowShouldClose:(id)sender { (void)sender; closed = true; return NO; }
@end
@interface ZincNavigation : NSView {
  CGImageRef image;
  uint64_t serial;
}
- (void)tick;
@end
@implementation ZincNavigation
- (BOOL)isFlipped { return YES; }
- (BOOL)acceptsFirstMouse:(NSEvent*)event { (void)event; return YES; }
- (BOOL)acceptsFirstResponder { return YES; }
- (void)tick {
  ZnEmbedFrame frame{};
  if (!zn_embed_frame(&frame) || frame.serial == serial) return;
  serial = frame.serial;
  if (image) CGImageRelease(image);
  CFDataRef bytes = CFDataCreate(kCFAllocatorDefault,reinterpret_cast<const UInt8*>(frame.pixels),frame.stride_bytes*frame.height);
  CGDataProviderRef provider = CGDataProviderCreateWithCFData(bytes);
  CGColorSpaceRef color = CGColorSpaceCreateDeviceRGB();
  image = CGImageCreate(frame.width,frame.height,8,32,frame.stride_bytes,color,kCGBitmapByteOrder32Little|kCGImageAlphaPremultipliedFirst,provider,nullptr,false,kCGRenderingIntentDefault);
  CGColorSpaceRelease(color); CGDataProviderRelease(provider); CFRelease(bytes);
  [self setNeedsDisplay:YES];
}
- (void)drawRect:(NSRect)dirty {
  (void)dirty;
  if (!image) return;
  CGContextRef context = [[NSGraphicsContext currentContext] CGContext];
  CGContextSaveGState(context); CGContextTranslateCTM(context,0,self.bounds.size.height); CGContextScaleCTM(context,1,-1);
  CGContextDrawImage(context,self.bounds,image); CGContextRestoreGState(context);
}
- (void)pointer:(NSEvent*)event kind:(int)kind {
  NSPoint point = [self convertPoint:event.locationInWindow fromView:nil];
  ZnEmbedEvent input{}; input.kind=kind; input.x=point.x; input.y=point.y;
  zn_embed_event(&input);
}
- (void)mouseDown:(NSEvent*)event { [self.window makeFirstResponder:self]; [self pointer:event kind:ZN_EMBED_DOWN]; }
- (void)mouseUp:(NSEvent*)event { [self pointer:event kind:ZN_EMBED_UP]; }
- (void)mouseDragged:(NSEvent*)event { [self pointer:event kind:ZN_EMBED_MOVE]; }
- (void)dealloc { if (image) CGImageRelease(image); [super dealloc]; }
@end

int main(int argc,char** argv) {
  const auto host_start=std::chrono::steady_clock::now();
  auto now=[&]() { return std::chrono::duration<double,std::micro>(std::chrono::steady_clock::now()-host_start).count(); };
  int bench_frames=0;
  std::string workload="active";
  for (int i=2;i<argc;++i) {
    if (!std::strcmp(argv[i],"--bench-frames")) {
      char* end=nullptr;
      if (++i>=argc) return 2;
      long count=std::strtol(argv[i],&end,10);
      if (*end || count<31 || count>360) { std::fprintf(stderr,"bench frames must be 31...360\n"); return 2; }
      bench_frames=int(count);
    } else if (!std::strcmp(argv[i],"--bench-workload")) {
      if (++i>=argc) return 2;
      workload=argv[i];
      if (workload!="idle" && workload!="active") { std::fprintf(stderr,"bench workload must be idle or active\n"); return 2; }
    }
  }
  if (bench_frames) setenv("ZINC_BACKGROUND","1",1);
  if (argc < 2) { std::fprintf(stderr,"usage: rally <libgodot.dylib> [--self-test]\n"); return 2; }
  const bool test = argc > 2 && std::strcmp(argv[2],"--self-test") == 0;
  const bool visual = argc > 3 && std::strcmp(argv[2],"--visual-test") == 0;
  @autoreleasepool {
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    if (zn_embed_install(320,640,1)) return 1;
    char name[]="Zinc Pocket Rally"; char* zinc_args[]={name,nullptr};
    if (zn_app_init(1,zinc_args)) { zn_embed_quit(); return 1; }
    zn::rt::gConsoleTap = command;
    void* library = dlopen(argv[1],RTLD_NOW|RTLD_LOCAL);
    if (!library) { std::fprintf(stderr,"LibGodot: %s\n",dlerror()); zn_embed_quit(); return 1; }
    using Create=GDExtensionObjectPtr(*)(int,char**,GDExtensionInitializationFunction);
    using Destroy=void(*)(GDExtensionObjectPtr);
    auto create=reinterpret_cast<Create>(dlsym(library,"libgodot_create_godot_instance"));
    auto destroy=reinterpret_cast<Destroy>(dlsym(library,"libgodot_destroy_godot_instance"));
    if (!create || !destroy) { std::fprintf(stderr,"LibGodot: expected 4.6 create/destroy symbols\n"); zn_embed_quit(); return 1; }
    std::vector<std::string> arguments={argv[0],"--rendering-method","gl_compatibility","--disable-crash-handler"};
    if (test) { arguments.push_back("--headless"); arguments.push_back("--fixed-fps"); arguments.push_back("60"); }
    std::vector<char*> pointers;
    for (auto& argument:arguments) pointers.push_back(argument.data());
    auto raw=create(int(pointers.size()),pointers.data(),initialize_godot);
    if (!raw) { std::fprintf(stderr,"LibGodot: instance creation failed\n"); zn_embed_quit(); return 1; }
    // ClassDB singleton is registered by start(); bind the early instance as Object.
    Object* instance=reinterpret_cast<Object*>(internal::gdextension_interface_object_get_instance_binding(raw,internal::token,&Object::_gde_binding_callbacks));
    bool started=instance->call("start");
    if (!started) { destroy(raw); zn_embed_quit(); return 1; }
    Object* engine=singleton("Engine");
    Object* tree=engine->call("get_main_loop");
    Object* root=tree->call("get_root");
    Object* game=root->call("get_child",0);
    NSWindow* window=nil; NSWindow* game_window=nil; NSView* game_view=nil;
    ZincNavigation* navigation=nil;
    RallyWindowDelegate* delegate=nil;
    if (!test) {
      Object* display=singleton("DisplayServer");
      const int64_t view_handle=display->call("window_get_native_handle",2,0);
      const int64_t window_handle=display->call("window_get_native_handle",1,0);
      game_view=reinterpret_cast<NSView*>(view_handle); game_window=reinterpret_cast<NSWindow*>(window_handle);
      if (!game_view || !game_window) { std::fprintf(stderr,"LibGodot: macOS native view unavailable\n"); destroy(raw); zn_embed_quit(); return 1; }
      [game_view retain]; [game_window orderOut:nil];
      [game_window setContentView:[[[NSView alloc] initWithFrame:NSMakeRect(0,0,800,640)] autorelease]];
      window=[[NSWindow alloc] initWithContentRect:NSMakeRect(80,80,1120,640) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable backing:NSBackingStoreBuffered defer:NO];
      delegate=[[RallyWindowDelegate alloc] init]; window.delegate=delegate;
      window.title=@"Zinc Pocket Rally — real LibGodot 4.6";
      navigation=[[ZincNavigation alloc] initWithFrame:NSMakeRect(0,0,320,640)];
      [window.contentView addSubview:navigation];
      game_view.frame=NSMakeRect(320,0,800,640); [window.contentView addSubview:game_view];
      [window orderFront:nil];
      if (!std::getenv("ZINC_BACKGROUND")) [window makeKeyWindow];
    }
    if (bench_frames && workload=="idle") game->call("command",String("pause"));
    double first_ready=0, previous_tick=0;
    std::vector<double> intervals, godot_ticks, zinc_ticks;
    int frames=0, result=0;
    double initial_paddle=double(game->get("paddle"));
    while (!closed) {
      @autoreleasepool {
        if (!test) {
          NSEvent* event;
          while ((event=[NSApp nextEventMatchingMask:NSEventMaskAny untilDate:[NSDate distantPast] inMode:NSDefaultRunLoopMode dequeue:YES])) [NSApp sendEvent:event];
        }
        const double tick_start=now();
        const double godot_start=now();
        if (bool(instance->call("iteration"))) { if (bench_frames) result=1; break; }
        const double godot_duration=now()-godot_start;
        if (!pending.empty()) { game->call("command",String(pending.c_str())); pending.clear(); }
        const int64_t score=game->call("snapshot");
        char text[32]; std::snprintf(text,sizeof(text),"%lld",static_cast<long long>(score)); setenv("ZINC_RALLY_SCORE",text,1);
        const double zinc_start=now();
        if (zn_embed_tick() != 0) { result=1; break; }
        if (!test) { [navigation tick]; [window displayIfNeeded]; }
        if (bench_frames) {
          const double zinc_duration=now()-zinc_start;
          if (!first_ready && game_view && window && [game_view window]) {
            first_ready=now(); std::puts("workflow ready"); std::fflush(stdout);
          }
          ++frames;
          if (frames>30) {
            intervals.push_back(tick_start-previous_tick);
            godot_ticks.push_back(godot_duration); zinc_ticks.push_back(zinc_duration);
          }
          previous_tick=tick_start;
          if (frames==bench_frames) { if (!first_ready) result=1; break; }
        }
        if (visual) {
          ++frames;
          if (frames==20) {
            if (game_view.superview != window.contentView || navigation.superview != window.contentView) { result=1; break; }
            [window makeFirstResponder:game_view];
            [window sendEvent:[NSEvent keyEventWithType:NSEventTypeKeyDown location:NSZeroPoint modifierFlags:0 timestamp:0 windowNumber:window.windowNumber context:nil characters:@"\uf701" charactersIgnoringModifiers:@"\uf701" isARepeat:NO keyCode:125]];
          }
          if (frames==50) {
            [window sendEvent:[NSEvent keyEventWithType:NSEventTypeKeyUp location:NSZeroPoint modifierFlags:0 timestamp:0 windowNumber:window.windowNumber context:nil characters:@"\uf701" charactersIgnoringModifiers:@"\uf701" isARepeat:NO keyCode:125]];
            if (double(game->get("paddle")) <= initial_paddle+1) { std::fprintf(stderr,"native key input failed\n"); result=1; break; }
          }
          if (frames==60 || frames==62) {
            NSPoint point=[navigation convertPoint:NSMakePoint(160,210) toView:nil];
            NSEventType type=frames==60 ? NSEventTypeLeftMouseDown : NSEventTypeLeftMouseUp;
            [window sendEvent:[NSEvent mouseEventWithType:type location:point modifierFlags:0 timestamp:0 windowNumber:window.windowNumber context:nil eventNumber:0 clickCount:1 pressure:1]];
          }
          if (frames==70 && !bool(game->get("paused"))) { std::fprintf(stderr,"native Zinc click failed\n"); result=1; break; }
          if (frames==80) {
            Object* viewport=game->call("get_viewport");
            Variant texture_value=viewport->call("get_texture");
            Object* texture=texture_value;
            Variant image_value=texture->call("get_image");
            Object* image=image_value;
            if (!image || int64_t(image->call("save_png",String(argv[3]))) != 0) { result=1; break; }
            [window performClose:nil];
            if (!closed) { result=1; break; }
          }
          [NSThread sleepForTimeInterval:0.016];
        }
        if (test) {
          ++frames;
          ZnEmbedEvent click{}; click.x=160;
          if (frames==3 || frames==7 || frames==10 || frames==100) {
            click.kind=ZN_EMBED_DOWN; click.y=frames==10 ? 285 : frames==100 ? 359 : 210; zn_embed_event(&click);
          }
          if (frames==4 || frames==8 || frames==11 || frames==101) {
            click.kind=ZN_EMBED_UP; click.y=frames==11 ? 285 : frames==101 ? 359 : 210; zn_embed_event(&click);
          }
          if (frames==6 && !bool(game->get("paused"))) { result=1; break; }
          if (frames==14 && double(game->get("speed")) <= 1.0) { result=1; break; }
          if (frames==10 && bool(game->get("paused"))) { std::fprintf(stderr,"resume action failed\n"); result=1; break; }
          // Explicit simulation time makes the score proof independent of host scheduling.
          if (frames>=20 && frames<=22) game->call("_process",1.0);
          if (frames==30 && int64_t(game->call("snapshot")) < 1) { std::fprintf(stderr,"score did not advance\n"); result=1; break; }
          if (frames==110) { if (int64_t(game->call("snapshot")) != 0) result=1; break; }
        }
      }
    }
    if (bench_frames && !result && frames==bench_frames) {
      std::printf("workflow bench json: {\"schema\":1,\"host\":\"zinc-libgodot\",\"workload\":\"%s\",\"warmup_frames\":30,\"total_frames\":%d,\"first_ready_us\":%.3f,\"clock_scope\":\"host_entry_to_native_view_first_iteration\",\"timing_scope\":\"host wall durations; no GPU completion\",\"sample_count\":%zu",workload.c_str(),frames,first_ready,godot_ticks.size());
      auto samples=[](const char* name,const std::vector<double>& values) {
        std::printf(",\"%s\":[",name);
        for (size_t i=0;i<values.size();++i) std::printf("%s%.3f",i ? "," : "",values[i]);
        std::putchar(']');
      };
      samples("interval_us",intervals); samples("godot_iteration_us",godot_ticks); samples("zinc_tick_present_us",zinc_ticks);
      std::puts("}"); std::fflush(stdout);
    }
    if (game_view) { [game_view removeFromSuperview]; [game_window setContentView:game_view]; [game_view release]; }
    zn::rt::gConsoleTap=nullptr; zn_embed_quit(); destroy(raw);
    [navigation release]; [window orderOut:nil]; [window release]; [delegate release];
    // Godot 4.6 supports one instance per process, with no restart/unload promise.
    if (visual && result==0) std::puts("PASS LibGodot native: attached views, AppKit game keys and Zinc click, GPU capture, window close and shutdown");
    if (test && result==0) std::puts("PASS LibGodot: real game ticks, Zinc commands/state, pause/speed/reset, clean shutdown");
    return result;
  }
}
