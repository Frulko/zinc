// zinc:location on iOS: the Core Location backend of macOS (location.macos.mm), which checks iOS's privacy rule under TARGET_OS_IPHONE. The
// Info.plist needs NSLocationWhenInUseUsageDescription: plugin.json writes a default, zinc.json "permissions": ["location"] with
// "permissionStrings": {"location": "..."} the app's own text.
#include "location.macos.mm"
