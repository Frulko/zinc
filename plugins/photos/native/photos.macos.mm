// zinc:photos on macOS and iOS (photos.ios.mm includes this file): PhotoKit, then the shared part (photos.host.cpp). Built with ARC
// (plugin.json flags). Listing (albums, assets) runs on the program's thread: fetch results are lazy, a page of assets costs little. Loads and
// saves answer on PhotoKit's queues: the handler fills the job (the drawing of a picture on a global queue, never the main one) and stores
// its state last; the program's thread polls it (index.ts). No callback touches the program's state.
// Privacy: the system asks once per app. iOS ends an app that asks without the usage text in its Info.plist (zinc.json "permissions":
// ["photos"] writes NSPhotoLibraryUsageDescription and NSPhotoLibraryAddUsageDescription, ["photos-add"] the second one), so without it
// the backend answers denied instead of asking; a macOS process without a bundle (zinc run) has none either and is treated the same way.
#define PH_BACKEND 1
#import <Photos/Photos.h>
#import <CoreGraphics/CoreGraphics.h>
#include <TargetConditionals.h>
#if TARGET_OS_IPHONE
#import <UIKit/UIKit.h>
#import <PhotosUI/PhotosUI.h>   // presentLimitedLibraryPickerFromViewController
#else
#import <AppKit/AppKit.h>
#endif
#include "backend.h"

namespace {
std::string s(NSString* v) { return v ? std::string(v.UTF8String) : std::string(); }
NSString* ns(const std::string& v) { return [NSString stringWithUTF8String:v.c_str()] ?: @""; }
PHAccessLevel level_of(int level) { return level == 1 ? PHAccessLevelAddOnly : PHAccessLevelReadWrite; }
void fail(const std::shared_ptr<PhJob>& job, const std::string& why) { job->result = why; job->state.store(-1, std::memory_order_release); }

// the picture drawn upright into the job's pixels: BGRX in memory, which the runtime image reads as 0x00RRGGBB
void draw(CGImageRef img, const std::shared_ptr<PhJob>& job) {
  const int w = (int)CGImageGetWidth(img), h = (int)CGImageGetHeight(img);
  if (w <= 0 || h <= 0) { fail(job, "photos: the picture is empty"); return; }
  job->px.assign((size_t)w * h, 0);
  CGColorSpaceRef cs = CGColorSpaceCreateDeviceRGB();
  CGContextRef ctx = CGBitmapContextCreate(job->px.data(), w, h, 8, (size_t)w * 4, cs, kCGImageAlphaNoneSkipFirst | kCGBitmapByteOrder32Little);
  CGColorSpaceRelease(cs);
  if (!ctx) { fail(job, "photos: cannot draw the picture"); return; }
  CGContextSetInterpolationQuality(ctx, kCGInterpolationHigh);
  CGContextDrawImage(ctx, CGRectMake(0, 0, w, h), img);
  CGContextRelease(ctx);
  job->w = w; job->h = h;
  job->state.store(1, std::memory_order_release);
}

#if TARGET_OS_IPHONE
UIViewController* top() {   // the view controller to present from: SDL's, or whatever it presents (as zinc:system's pickers)
  UIWindow* w = nil;
  for (UIScene* sc in UIApplication.sharedApplication.connectedScenes)
    if ([sc isKindOfClass:UIWindowScene.class]) for (UIWindow* x in ((UIWindowScene*)sc).windows) if (x.isKeyWindow || !w) w = x;
  UIViewController* vc = w.rootViewController;
  while (vc.presentedViewController) vc = vc.presentedViewController;
  return vc;
}
#endif
}  // namespace

int ph_backend_permission(int level, bool ask, std::string& err) {
  switch ([PHPhotoLibrary authorizationStatusForAccessLevel:level_of(level)]) {
    case PHAuthorizationStatusAuthorized: return 1;
    case PHAuthorizationStatusLimited: return 3;
    case PHAuthorizationStatusDenied: case PHAuthorizationStatusRestricted: return 2;
    default: {
      NSString* key = level == 1 ? @"NSPhotoLibraryAddUsageDescription" : @"NSPhotoLibraryUsageDescription";
      if (![[NSBundle mainBundle] objectForInfoDictionaryKey:key]) {
        err = "photos: the app's Info.plist has no " + s(key) + " (zinc.json \"permissions\": [\"photos\"] writes it at export)";
        return 2;
      }
      if (ask) [PHPhotoLibrary requestAuthorizationForAccessLevel:level_of(level) handler:^(PHAuthorizationStatus) {}];
      return 0;
    }
  }
}

bool ph_backend_manage_limited(std::shared_ptr<PhJob> job) {
#if TARGET_OS_IPHONE
  if ([PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite] != PHAuthorizationStatusLimited) return false;
  UIViewController* from = top();
  if (!from) return false;
  [PHPhotoLibrary.sharedPhotoLibrary presentLimitedLibraryPickerFromViewController:from completionHandler:^(NSArray<NSString*>*) { job->state.store(1, std::memory_order_release); }];
  return true;
#else
  (void)job;
  return false;   // macOS has no limited level
#endif
}

bool ph_backend_albums(std::vector<PhAlbum>& out, std::string&) {
  @autoreleasepool {
    PHFetchOptions* images = [PHFetchOptions new];   // what an album holds: what assets() lists of it
    auto add = [&](PHAssetCollection* c, const char* kind) {
      PhAlbum a;
      a.id = s(c.localIdentifier); a.title = s(c.localizedTitle); a.kind = kind;
      a.count = (int)[PHAsset fetchAssetsInAssetCollection:c options:images].count;
      out.push_back(a);
    };
    // the smart albums the Photos app shows: Recents first, then those that hold something (Favorites, Screenshots, Selfies, Videos...)
    PHFetchResult<PHAssetCollection*>* recents = [PHAssetCollection fetchAssetCollectionsWithType:PHAssetCollectionTypeSmartAlbum subtype:PHAssetCollectionSubtypeSmartAlbumUserLibrary options:nil];
    for (PHAssetCollection* c in recents) add(c, "smart");
    PHFetchResult<PHAssetCollection*>* smart = [PHAssetCollection fetchAssetCollectionsWithType:PHAssetCollectionTypeSmartAlbum subtype:PHAssetCollectionSubtypeAny options:nil];
    for (PHAssetCollection* c in smart) {
      if (c.assetCollectionSubtype == PHAssetCollectionSubtypeSmartAlbumUserLibrary || c.assetCollectionSubtype == PHAssetCollectionSubtypeSmartAlbumAllHidden) continue;
      const size_t before = out.size();
      add(c, "smart");
      if (out.back().count == 0) out.resize(before);
    }
    PHFetchResult<PHAssetCollection*>* user = [PHAssetCollection fetchAssetCollectionsWithType:PHAssetCollectionTypeAlbum subtype:PHAssetCollectionSubtypeAny options:nil];
    for (PHAssetCollection* c in user) add(c, "user");
    return true;
  }
}

bool ph_backend_assets(const std::string& album, int offset, int limit, std::vector<PhAsset>& out, std::string& err) {
  @autoreleasepool {
    PHFetchOptions* o = [PHFetchOptions new];
    o.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:@"creationDate" ascending:NO]];
    PHFetchResult<PHAsset*>* r;
    if (album.empty()) r = [PHAsset fetchAssetsWithOptions:o];
    else {
      PHAssetCollection* c = [PHAssetCollection fetchAssetCollectionsWithLocalIdentifiers:@[ns(album)] options:nil].firstObject;
      if (!c) { err = "photos: no album '" + album + "'"; return false; }
      r = [PHAsset fetchAssetsInAssetCollection:c options:o];
    }
    for (NSInteger i = offset; i < (NSInteger)r.count && i < offset + limit; i++) {
      PHAsset* a = r[i];
      PhAsset x;
      x.id = s(a.localIdentifier);
      x.date = a.creationDate ? a.creationDate.timeIntervalSince1970 * 1000 : 0;
      x.w = (int)a.pixelWidth; x.h = (int)a.pixelHeight;
      x.type = a.mediaType == PHAssetMediaTypeImage ? "image" : a.mediaType == PHAssetMediaTypeVideo ? "video" : a.mediaType == PHAssetMediaTypeAudio ? "audio" : "unknown";
      if (CLLocation* l = a.location) { x.located = true; x.lat = l.coordinate.latitude; x.lon = l.coordinate.longitude; }
      out.push_back(x);
    }
    return true;
  }
}

void ph_backend_load(const std::string& assetId, int w, int h, std::shared_ptr<PhJob> job) {
  @autoreleasepool {
    PHAsset* a = [PHAsset fetchAssetsWithLocalIdentifiers:@[ns(assetId)] options:nil].firstObject;
    if (!a) { fail(job, "photos: no asset '" + assetId + "'"); return; }
    PHImageRequestOptions* o = [PHImageRequestOptions new];
    o.deliveryMode = PHImageRequestOptionsDeliveryModeHighQualityFormat;   // one answer, not a blurry one first
    o.resizeMode = PHImageRequestOptionsResizeModeFast;
    o.networkAccessAllowed = YES;                                          // a picture kept in iCloud is downloaded
    o.synchronous = NO;
    [PHImageManager.defaultManager requestImageForAsset:a targetSize:CGSizeMake(w, h) contentMode:PHImageContentModeAspectFit options:o
                                          resultHandler:^(id image, NSDictionary* info) {
      if (!image) { NSError* e = info[PHImageErrorKey]; fail(job, "photos: cannot load the picture" + (e ? ": " + s(e.localizedDescription) : std::string())); return; }
      dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        @autoreleasepool {
#if TARGET_OS_IPHONE
          UIImage* ui = image;
          if (ui.imageOrientation != UIImageOrientationUp) {   // CGImage is the sensor's way up: draw it turned as the UIImage says
            UIGraphicsImageRendererFormat* f = [UIGraphicsImageRendererFormat preferredFormat];
            f.scale = 1;
            ui = [[[UIGraphicsImageRenderer alloc] initWithSize:ui.size format:f] imageWithActions:^(UIGraphicsImageRendererContext*) { [image drawInRect:CGRectMake(0, 0, ui.size.width, ui.size.height)]; }];
          }
          CGImageRef cg = ui.CGImage;
#else
          CGImageRef cg = [(NSImage*)image CGImageForProposedRect:nil context:nil hints:nil];
#endif
          if (cg) draw(cg, job);
          else fail(job, "photos: the picture has no bitmap");
        }
      });
    }];
  }
}

void ph_backend_save(std::vector<uint8_t> bytes, const std::string& album, std::shared_ptr<PhJob> job) {
  NSData* data = [NSData dataWithBytes:bytes.data() length:bytes.size()];
  NSString* title = album.empty() ? nil : ns(album);
  __block NSString* created = nil;
  [PHPhotoLibrary.sharedPhotoLibrary performChanges:^{
    PHAssetCreationRequest* r = [PHAssetCreationRequest creationRequestForAsset];
    [r addResourceWithType:PHAssetResourceTypePhoto data:data options:nil];
    PHObjectPlaceholder* placeholder = r.placeholderForCreatedAsset;
    created = placeholder.localIdentifier;
    if (!title) return;
    PHFetchOptions* o = [PHFetchOptions new];   // the user album of that title, made when missing
    o.predicate = [NSPredicate predicateWithFormat:@"localizedTitle = %@", title];
    PHAssetCollection* c = [PHAssetCollection fetchAssetCollectionsWithType:PHAssetCollectionTypeAlbum subtype:PHAssetCollectionSubtypeAlbumRegular options:o].firstObject;
    PHAssetCollectionChangeRequest* change = c ? [PHAssetCollectionChangeRequest changeRequestForAssetCollection:c]
                                               : [PHAssetCollectionChangeRequest creationRequestForAssetCollectionWithTitle:title];
    [change addAssets:@[placeholder]];
  } completionHandler:^(BOOL ok, NSError* e) {
    if (!ok) { fail(job, "photos: the picture was not saved" + (e ? ": " + s(e.localizedDescription) : std::string())); return; }
    job->result = s(created);
    job->state.store(1, std::memory_order_release);
  }];
}

#include "photos.host.cpp"
