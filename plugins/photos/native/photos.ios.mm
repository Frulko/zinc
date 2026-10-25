// zinc:photos on iOS: the PhotoKit backend of macOS (photos.macos.mm), which draws UIImages and presents the limited-library picker under
// TARGET_OS_IPHONE. The Info.plist needs NSPhotoLibraryUsageDescription (and NSPhotoLibraryAddUsageDescription to save): zinc.json
// "permissions": ["photos"] writes both (with "permissionStrings": {"photos": "..."} for the text), ["photos-add"] the second one only.
#include "photos.macos.mm"
