// zinc:camera on iOS: the AVFoundation backend of macOS (camera.macos.mm), which picks iOS's device types, orientation and privacy rule
// under TARGET_OS_IPHONE. The Info.plist needs NSCameraUsageDescription: zinc.json "permissions": ["camera"] writes it (with
// "permissionStrings": {"camera": "..."} for the text).
#include "camera.macos.mm"
