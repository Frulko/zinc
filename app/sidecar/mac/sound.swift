// The Mac's sound for a screen that plays it (sidecar-screen --audio): a Core Audio process tap of every app (macOS 14.2+), muted on the
// Mac while it is tapped, so the sound moves to the screen instead of playing twice; read through a private aggregate device, converted
// to 16-bit interleaved and handed out as it comes (~10 ms at a time). The tap and the device go with the process, and the Mac's sound
// with them. macOS asks once for the "system audio recording" permission (NSAudioCaptureUsageDescription in Sidecar.app).
import CoreAudio
import Foundation

final class SoundTap {
    private(set) var rate = 48000.0, channels = 2
    private var tap = AudioObjectID(kAudioObjectUnknown), device = AudioObjectID(kAudioObjectUnknown)
    private var proc: AudioDeviceIOProcID?

    /** Starts the tap; `take` gets each buffer's samples on Core Audio's thread. nil when it runs, else why not. */
    func start(_ take: @escaping (UnsafeBufferPointer<Int16>) -> Void) -> String? {
        guard #available(macOS 14.2, *) else { return "macOS 14.2 or later is needed to take the Mac's sound" }
        let d = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
        d.muteBehavior = .mutedWhenTapped
        d.isPrivate = true
        d.name = "Zinc Sidecar"
        var e = AudioHardwareCreateProcessTap(d, &tap)
        if e != noErr { return "no tap of the Mac's sound (\(e)): allow Sidecar in System Settings, Privacy, Screen & System Audio Recording" }
        var fmt = AudioStreamBasicDescription(), n = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        var a = AudioObjectPropertyAddress(mSelector: kAudioTapPropertyFormat, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        e = AudioObjectGetPropertyData(tap, &a, 0, nil, &n, &fmt)
        if e != noErr || fmt.mFormatID != kAudioFormatLinearPCM || fmt.mFormatFlags & kAudioFormatFlagIsFloat == 0 || fmt.mBitsPerChannel != 32 {
            return "the tap's format is not 32-bit float (\(e))"
        }
        rate = fmt.mSampleRate; channels = Int(min(fmt.mChannelsPerFrame, 2))
        // the aggregate device: the default output as its clock, the tap as its input
        var out = AudioObjectID(kAudioObjectUnknown); n = UInt32(MemoryLayout<AudioObjectID>.size)
        a = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDefaultSystemOutputDevice, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &n, &out)
        var uid: CFString = "" as CFString; n = UInt32(MemoryLayout<CFString>.size)
        a = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyDeviceUID, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        e = withUnsafeMutablePointer(to: &uid) { AudioObjectGetPropertyData(out, &a, 0, nil, &n, $0) }
        if e != noErr { return "no default output device (\(e))" }
        let agg: [String: Any] = [
            kAudioAggregateDeviceNameKey: "Zinc Sidecar tap", kAudioAggregateDeviceUIDKey: UUID().uuidString,
            kAudioAggregateDeviceMainSubDeviceKey: uid as String, kAudioAggregateDeviceIsPrivateKey: true, kAudioAggregateDeviceIsStackedKey: false,
            kAudioAggregateDeviceTapAutoStartKey: true, kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: uid as String]],
            kAudioAggregateDeviceTapListKey: [[kAudioSubTapDriftCompensationKey: true, kAudioSubTapUIDKey: d.uuid.uuidString]],
        ]
        e = AudioHardwareCreateAggregateDevice(agg as CFDictionary, &device)
        if e != noErr { return "no aggregate device for the tap (\(e))" }
        var s16 = [Int16](repeating: 0, count: 8192)
        let ch = channels
        e = AudioDeviceCreateIOProcIDWithBlock(&proc, device, nil) { _, input, _, _, _ in
            let list = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input))
            guard let first = list.first, let p0 = first.mData else { return }
            // interleaved: one buffer of frames x channels; else one buffer a channel
            let inter = list.count == 1, perFrame = inter ? Int(first.mNumberChannels) : 1
            let frames = Int(first.mDataByteSize) / 4 / perFrame
            if frames * ch > s16.count { s16 = [Int16](repeating: 0, count: frames * ch) }
            s16.withUnsafeMutableBufferPointer { o in
                for c in 0..<ch {
                    let src = inter ? p0.assumingMemoryBound(to: Float.self) + min(c, perFrame - 1) : (list[min(c, list.count - 1)].mData ?? p0).assumingMemoryBound(to: Float.self)
                    for i in 0..<frames { o[i * ch + c] = Int16(max(-1, min(1, src[i * perFrame])) * 32767) }
                }
                take(UnsafeBufferPointer(rebasing: o[0..<(frames * ch)]))
            }
        }
        if e != noErr { return "no reader for the tap (\(e))" }
        e = AudioDeviceStart(device, proc)
        return e == noErr ? nil : "the tap does not start (\(e))"
    }
}
