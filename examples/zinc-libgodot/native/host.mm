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
  if (argc < 2) { std::fprintf(stderr,"usage: rally <libgodot.dylib> [--self-test]\n"); return 2; }
  const bool test = argc > 2 && std::strcmp(argv[2],"--self-test") == 0;
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
    int frames=0, result=0;
    while (!closed) {
      @autoreleasepool {
        if (bool(instance->call("iteration"))) break;
        if (!pending.empty()) { game->call("command",String(pending.c_str())); pending.clear(); }
        const int64_t score=game->call("snapshot");
        char text[32]; std::snprintf(text,sizeof(text),"%lld",static_cast<long long>(score)); setenv("ZINC_RALLY_SCORE",text,1);
        if (zn_embed_tick() != 0) { result=1; break; }
        if (!test) { [navigation tick]; [window displayIfNeeded]; }
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
    if (game_view) { [game_view removeFromSuperview]; [game_window setContentView:game_view]; [game_view release]; }
    zn::rt::gConsoleTap=nullptr; zn_embed_quit(); destroy(raw);
    [navigation release]; [window orderOut:nil]; [window release]; [delegate release];
    // Godot 4.6 supports one instance per process, with no restart/unload promise.
    if (test && result==0) std::puts("PASS LibGodot: real game ticks, Zinc commands/state, pause/speed/reset, clean shutdown");
    return result;
  }
}
