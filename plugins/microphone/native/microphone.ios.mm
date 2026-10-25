// zinc:microphone on iOS: the macOS file (AVFoundation's privacy question is the same on iOS) over miniaudio's Core Audio back end, which
// on iOS captures through the audio session. MIC_IOS_SESSION sets it for a call (microphone.host.cpp): play and record, the loudspeaker
// rather than the earpiece, Bluetooth headsets. zinc:audio's context asks for play and record with the loudspeaker too (miniaudio's default
// on iOS), so what it plays goes on while the microphone captures. The Info.plist needs NSMicrophoneUsageDescription: zinc.json
// "permissions": ["microphone"] writes it.
#define MIC_IOS_SESSION 1
#include "microphone.macos.mm"
