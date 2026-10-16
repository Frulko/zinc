// zinc:microphone on macOS: the privacy question through AVFoundation, then the shared part (microphone.host.cpp: miniaudio's Core Audio
// capture). Core Audio itself would ask on the first capture; the host never starts one before access is granted, and a process without
// NSMicrophoneUsageDescription is never stopped for asking: `zinc export` writes the usage text and the entitlement.
#define MIC_PERMISSION 1
#import <AVFoundation/AVFoundation.h>

int mic_permission(bool ask) {
  switch ([AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio]) {
    case AVAuthorizationStatusAuthorized: return 1;
    case AVAuthorizationStatusDenied: case AVAuthorizationStatusRestricted: return 2;
    default:
      if (ask) [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL) {}];
      return 0;
  }
}

#include "microphone.host.cpp"
