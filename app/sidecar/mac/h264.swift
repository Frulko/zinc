// The part of the screen where a video plays, as H.264 (sidecar-screen): VideoToolbox on the Mac's media engine, set for the lowest
// delay (real time, no frame reordering, low-latency rate control when this Mac has it), each picture out before the next one comes in.
// The receiver decodes it in hardware (a Raspberry Pi's bcm2835-codec, V4L2) and shows it on a plane under the rest of the screen,
// which stays lossless tiles. docs/reports/sidecar-video-audio-research.md
import Foundation
import VideoToolbox
import CoreMedia

final class VideoEncoder {
    let w: Int, h: Int
    private var session: VTCompressionSession?
    private var n: Int64 = 0
    private(set) var lowLatency = false
    var keyNext = true

    /** A session for pictures of w x h (multiples of 16), `bitrate` bits a second on average. Nil when VideoToolbox refuses. */
    init?(w: Int, h: Int, bitrate: Int) {
        self.w = w; self.h = h
        // the low-latency rate control (macOS 11.3+) answers each picture at once; some Macs refuse it (-12902): the ordinary one then
        for low in [true, false] {
            var s: VTCompressionSession?
            let spec = low ? [kVTVideoEncoderSpecification_EnableLowLatencyRateControl: true] as CFDictionary : nil
            if VTCompressionSessionCreate(allocator: nil, width: Int32(w), height: Int32(h), codecType: kCMVideoCodecType_H264, encoderSpecification: spec,
                                          imageBufferAttributes: nil, compressedDataAllocator: nil, outputCallback: nil, refcon: nil, compressionSessionOut: &s) == noErr, let s {
                session = s; lowLatency = low; break
            }
        }
        guard let s = session else { return nil }
        let set = { (k: CFString, v: CFTypeRef) in _ = VTSessionSetProperty(s, key: k, value: v) }
        set(kVTCompressionPropertyKey_RealTime, kCFBooleanTrue)
        set(kVTCompressionPropertyKey_AllowFrameReordering, kCFBooleanFalse)   // no B pictures: each one decodes as it comes
        set(kVTCompressionPropertyKey_ProfileLevel, kVTProfileLevel_H264_High_AutoLevel)
        set(kVTCompressionPropertyKey_AverageBitRate, bitrate as CFNumber)
        set(kVTCompressionPropertyKey_ExpectedFrameRate, 60 as CFNumber)
        set(kVTCompressionPropertyKey_MaxKeyFrameIntervalDuration, 10 as CFNumber)
        set(kVTCompressionPropertyKey_MaxFrameDelayCount, 0 as CFNumber)   // the encoder keeps no picture back either
        // one reference picture: the SPS says one picture buffered, none reordered (the timing the Pi also needs: timedSPS)
        set(kVTCompressionPropertyKey_ReferenceBufferCount, 1 as CFNumber)
        VTCompressionSessionPrepareToEncodeFrames(s)
    }
    deinit { if let s = session { VTCompressionSessionInvalidate(s) } }

    /** The picture's (x, y, w, h) part of a BGRA capture, as one H.264 access unit in Annex B (start codes; SPS and PPS before a key picture). */
    func encode(_ pb: CVPixelBuffer, x: Int, y: Int) -> (data: [UInt8], key: Bool)? {
        guard let s = session else { return nil }
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        let bpr = CVPixelBufferGetBytesPerRow(pb)
        let base = CVPixelBufferGetBaseAddress(pb)! + y * bpr + x * 4
        // the region of the capture without a copy: the crop keeps the capture alive until VideoToolbox is done with it
        var crop: CVPixelBuffer?
        let keep = Unmanaged.passRetained(pb)
        let ok = CVPixelBufferCreateWithBytes(nil, w, h, kCVPixelFormatType_32BGRA, base, bpr, { ctx, _ in
            guard let ctx else { return }
            let p = Unmanaged<CVPixelBuffer>.fromOpaque(ctx).takeRetainedValue()
            CVPixelBufferUnlockBaseAddress(p, .readOnly)
        }, keep.toOpaque(), nil, &crop)
        guard ok == kCVReturnSuccess, let crop else { keep.release(); CVPixelBufferUnlockBaseAddress(pb, .readOnly); return nil }
        let pts = CMTime(value: n, timescale: 60); n += 1
        var out: (data: [UInt8], key: Bool)?
        let props = keyNext ? [kVTEncodeFrameOptionKey_ForceKeyFrame: true] as CFDictionary : nil
        keyNext = false
        VTCompressionSessionEncodeFrame(s, imageBuffer: crop, presentationTimeStamp: pts, duration: .invalid, frameProperties: props, infoFlagsOut: nil) { status, _, sb in
            guard status == noErr, let sb else { return }
            out = VideoEncoder.annexB(sb)
        }
        VTCompressionSessionCompleteFrames(s, untilPresentationTimeStamp: pts)   // the picture is out before the next one goes in
        return out
    }

    /** A sample buffer's NAL units (AVCC: a 4-byte length before each) with start codes, the parameter sets first on a key picture. */
    static func annexB(_ sb: CMSampleBuffer) -> (data: [UInt8], key: Bool)? {
        let notSync = (CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[CFString: Any]])?.first?[kCMSampleAttachmentKey_NotSync] as? Bool ?? false
        var out = [UInt8]()
        let start: [UInt8] = [0, 0, 0, 1]
        if !notSync, let fd = CMSampleBufferGetFormatDescription(sb) {
            var count = 0
            CMVideoFormatDescriptionGetH264ParameterSetAtIndex(fd, parameterSetIndex: 0, parameterSetPointerOut: nil, parameterSetSizeOut: nil, parameterSetCountOut: &count, nalUnitHeaderLengthOut: nil)
            for i in 0..<count {
                var p: UnsafePointer<UInt8>?, size = 0
                if CMVideoFormatDescriptionGetH264ParameterSetAtIndex(fd, parameterSetIndex: i, parameterSetPointerOut: &p, parameterSetSizeOut: &size, parameterSetCountOut: nil, nalUnitHeaderLengthOut: nil) == noErr, let p {
                    let ps = [UInt8](UnsafeBufferPointer(start: p, count: size))
                    out += start; out += ps.first.map { $0 & 31 == 7 } == true ? (timedSPS(ps) ?? ps) : ps
                }
            }
        }
        guard let bb = CMSampleBufferGetDataBuffer(sb) else { return nil }
        var len = 0, ptr: UnsafeMutablePointer<CChar>?
        guard CMBlockBufferGetDataPointer(bb, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &len, dataPointerOut: &ptr) == noErr, let ptr else { return nil }
        let raw = UnsafeRawPointer(ptr)
        var i = 0
        while i + 4 <= len {
            let n = Int(UInt32(bigEndian: raw.loadUnaligned(fromByteOffset: i, as: UInt32.self)))
            i += 4
            guard n > 0, i + n <= len else { break }
            out += start; out += UnsafeBufferPointer(start: raw.advanced(by: i).assumingMemoryBound(to: UInt8.self), count: n)
            i += n
        }
        return (out, !notSync)
    }

    /** VideoToolbox's SPS with its VUI rewritten to carry timing (60 a second, fixed): without it a Raspberry Pi's decoder (bcm2835-codec)
     *  gives a picture out only when the next one comes in, 16.7 ms late at 60 (tools/v4l2dec-probe.cpp; the pictures decode the same).
     *  The colour description and the bitstream restriction (no reordering, one picture buffered) are kept. Nil for an SPS it cannot read. */
    static func timedSPS(_ nal: [UInt8]) -> [UInt8]? {
        // the RBSP without its emulation prevention bytes, as bits
        var rbsp = [UInt8](), zeros = 0
        for b in nal.dropFirst() { if zeros >= 2 && b == 3 { zeros = 0; continue }; rbsp.append(b); zeros = b == 0 ? zeros + 1 : 0 }
        var bits = [Bool](); bits.reserveCapacity(rbsp.count * 8)
        for b in rbsp { for k in (0..<8).reversed() { bits.append(b >> k & 1 == 1) } }
        var p = 0
        func u(_ n: Int) -> Int? { guard p + n <= bits.count else { return nil }; var v = 0; for _ in 0..<n { v = v << 1 | (bits[p] ? 1 : 0); p += 1 }; return v }
        func ue() -> Int? { var n = 0; while p < bits.count && !bits[p] { n += 1; p += 1 }; p += 1; guard n < 32, let r = u(n) else { return nil }; return (1 << n) - 1 + r }
        guard let profile = u(8), u(16) != nil, ue() != nil else { return nil }
        if [100, 110, 122, 244, 44, 83, 86, 118, 128].contains(profile) {
            guard let chroma = ue() else { return nil }
            if chroma == 3 { _ = u(1) }
            guard ue() != nil, ue() != nil, u(1) != nil, u(1) == 0 else { return nil }   // a scaling matrix: not read here
        }
        guard ue() != nil, let poc = ue() else { return nil }
        if poc == 0 { guard ue() != nil else { return nil } } else if poc == 1 { return nil }
        guard ue() != nil, u(1) != nil, ue() != nil, ue() != nil, let mbsOnly = u(1) else { return nil }
        if mbsOnly == 0 { _ = u(1) }
        guard u(1) != nil, let crop = u(1) else { return nil }
        if crop == 1 { for _ in 0..<4 { guard ue() != nil else { return nil } } }
        var colour: (Int, Int, Int, Int, Int)?   // video format, full range, primaries, transfer, matrix
        let vui = p
        if u(1) == 1 {
            if u(1) == 1, u(8) == 255 { _ = u(32) }
            if u(1) == 1 { _ = u(1) }
            if u(1) == 1, let f = u(3), let r = u(1) {
                colour = u(1) == 1 ? (f, r, u(8) ?? 2, u(8) ?? 2, u(8) ?? 2) : (f, r, 2, 2, 2)
            }
        }
        // the SPS up to its VUI, then a VUI of our own
        guard p <= bits.count else { return nil }
        var out = Array(bits[0..<vui])
        func put(_ v: Int, _ n: Int) { for k in (0..<n).reversed() { out.append(v >> k & 1 == 1) } }
        func putUE(_ v: Int) { let x = v + 1, n = Int.bitWidth - x.leadingZeroBitCount; put(0, n - 1); put(x, n) }
        put(1, 1)                       // vui_parameters_present_flag
        put(0, 1); put(0, 1)            // no aspect ratio, no overscan
        if let c = colour { put(1, 1); put(c.0, 3); put(c.1, 1); put(1, 1); put(c.2, 8); put(c.3, 8); put(c.4, 8) } else { put(0, 1) }
        put(0, 1)                       // no chroma location
        put(1, 1); put(1, 32); put(120, 32); put(1, 1)   // timing: 1/120 s a tick, two ticks a picture, fixed
        put(0, 3)                       // no HRD, no pic_struct
        put(1, 1); put(1, 1); putUE(0); putUE(0); putUE(15); putUE(15); putUE(0); putUE(1)   // no reordering, one picture buffered
        out.append(true); while out.count % 8 != 0 { out.append(false) }
        // back to bytes, with emulation prevention
        var res = [nal[0]]; zeros = 0
        for i in stride(from: 0, to: out.count, by: 8) {
            var b: UInt8 = 0
            for k in 0..<8 { b = b << 1 | (out[i + k] ? 1 : 0) }
            if zeros >= 2 && b <= 3 { res.append(3); zeros = 0 }
            res.append(b); zeros = b == 0 ? zeros + 1 : 0
        }
        return res
    }
}
