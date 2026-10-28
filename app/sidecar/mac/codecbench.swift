// codecbench: what a Sidecar picture costs on the wire, measured on the Mac's real screen. Captures the main display at its native size for
// N seconds (codecbench [seconds] [display index]), keeps the 64x64 tiles that changed since the last frame, and encodes them each way a
// receiver could read: bytes per frame, Mbit/s at the frames that came, and the encoder's time. Nothing is kept but the numbers.
// Build: clang -O2 -c -I third_party/zstd third_party/zstd/{common,compress}/*.c third_party/lz4/lz4.c, then swiftc -O with a bridging header
// that includes lz4.h and zstd.h, this file, the objects, -framework ScreenCaptureKit -framework CoreMedia.
import Foundation
import ScreenCaptureKit
import CoreMedia

setvbuf(stdout, nil, _IOLBF, 0)
let args = CommandLine.arguments
let seconds = args.count > 1 ? Double(args[1])! : 20
let which = args.count > 2 ? Int(args[2])! : 0
let T = 64

/** One way to put the changed tiles on the wire. */
struct Way { let name: String; let encode: ([UInt8]) -> Int; var bytes = [Int](); var ms = 0.0 }
func lz4(_ s: [UInt8]) -> Int {
    var d = [UInt8](repeating: 0, count: Int(LZ4_compressBound(Int32(s.count))))
    return Int(LZ4_compress_default(s, &d, Int32(s.count), Int32(d.count)))
}
let zctx = ZSTD_createCCtx()
func zstd(_ level: Int32) -> ([UInt8]) -> Int {
    { s in
        var d = [UInt8](repeating: 0, count: ZSTD_compressBound(s.count))
        return ZSTD_compressCCtx(zctx, &d, d.count, s, s.count, level)
    }
}
/** PNG's Sub: each byte minus the same channel of the pixel on its left, per tile row (3 bytes a pixel). */
func sub(_ s: [UInt8]) -> [UInt8] {
    var o = s
    let row = T * 3
    var i = 0
    while i < s.count { let e = min(i + row, s.count); var j = e - 1; while j >= i + 3 { o[j] = s[j] &- s[j - 3]; j -= 1 }; i = e }
    return o
}
var ways = [
    Way(name: "raw BGR", encode: { $0.count }),
    Way(name: "lz4", encode: lz4),
    Way(name: "sub + lz4", encode: { lz4(sub($0)) }),
    Way(name: "zstd 1", encode: zstd(1)),
    Way(name: "sub + zstd 1", encode: { zstd(1)(sub($0)) }),
    Way(name: "xor prev + zstd 1", encode: { _ in 0 }),   // filled in below: it needs the old tiles
    Way(name: "sub + zstd 3", encode: { zstd(3)(sub($0)) }),
]

var prev: UnsafeMutablePointer<UInt8>? = nil, W = 0, H = 0, frames = 0, dirtyPx = 0, full = 0
let lock = NSLock()
final class Out: NSObject, SCStreamOutput {
    func stream(_ s: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard let pb = sb.imageBuffer else { return }
        CVPixelBufferLockBaseAddress(pb, .readOnly); defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
        let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), bpr = CVPixelBufferGetBytesPerRow(pb)
        let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
        lock.lock(); defer { lock.unlock() }
        let first = prev == nil
        if first { W = w; H = h; prev = .allocate(capacity: w * h * 4) }
        let pv = prev!
        // the changed tiles, as BGR rows one tile after the other; their old pixels too (xor)
        var cur = [UInt8](), old = [UInt8]()
        for ty in stride(from: 0, to: h, by: T) {
            for tx in stride(from: 0, to: w, by: T) {
                let tw = min(T, w - tx), th = min(T, h - ty)
                var same = !first
                for y in ty..<(ty + th) where same { same = memcmp(base + y * bpr + tx * 4, pv + (y * w + tx) * 4, tw * 4) == 0 }
                if same { continue }
                dirtyPx += tw * th
                var at = cur.count
                cur.append(contentsOf: repeatElement(0, count: tw * th * 3)); old.append(contentsOf: repeatElement(0, count: tw * th * 3))
                cur.withUnsafeMutableBufferPointer { c in old.withUnsafeMutableBufferPointer { o in
                    for y in ty..<(ty + th) {
                        let p = base + y * bpr + tx * 4, q = pv + (y * w + tx) * 4
                        for x in 0..<tw { c[at] = p[x * 4]; c[at + 1] = p[x * 4 + 1]; c[at + 2] = p[x * 4 + 2]; o[at] = q[x * 4]; o[at + 1] = q[x * 4 + 1]; o[at + 2] = q[x * 4 + 2]; at += 3 }
                        memcpy(q, p, tw * 4)
                    }
                } }
            }
        }
        if first { full = zstd(1)(sub(cur)); print("first frame \(w)x\(h): \(cur.count / 1024) KB raw, sub + zstd 1 \(full / 1024) KB (\(cur.count / max(full, 1))x)"); return }
        if cur.isEmpty { frames += 1; for i in ways.indices { ways[i].bytes.append(0) }; return }
        frames += 1
        for i in ways.indices {
            let t = Date()
            let n = ways[i].name.hasPrefix("xor") ? zstd(1)(zip(cur, old).map { $0 ^ $1 }) : ways[i].encode(cur)
            ways[i].ms += Date().timeIntervalSince(t) * 1000
            ways[i].bytes.append(n)
        }
    }
}

let out = Out()
var stream: SCStream?
SCShareableContent.getWithCompletionHandler { content, err in
    guard let ds = content?.displays, which < ds.count else { print("codecbench: no display (\(err?.localizedDescription ?? "index"))"); exit(1) }
    let d = ds[which]
    let mode = CGDisplayCopyDisplayMode(d.displayID)
    let c = SCStreamConfiguration()
    c.width = mode?.pixelWidth ?? d.width * 2; c.height = mode?.pixelHeight ?? d.height * 2
    c.pixelFormat = kCVPixelFormatType_32BGRA; c.showsCursor = false; c.queueDepth = 4
    c.minimumFrameInterval = CMTime(value: 1, timescale: 60)
    let s = SCStream(filter: SCContentFilter(display: d, excludingWindows: []), configuration: c, delegate: nil)
    try! s.addStreamOutput(out, type: .screen, sampleHandlerQueue: DispatchQueue(label: "frames"))
    s.startCapture { e in if let e { print("codecbench: \(e.localizedDescription)"); exit(1) } }
    stream = s
    print("capturing display \(which) at \(c.width)x\(c.height) for \(Int(seconds)) s: use the Mac as usual (type, scroll, a video)")
}
DispatchQueue.main.asyncAfter(deadline: .now() + seconds) {
    lock.lock()
    let raw = W * H * 3, f = max(frames, 1)
    print(String(format: "%d frames (%.0f/s), %.1f%% of the pixels changed per frame; a whole frame is %d KB of BGR", frames, Double(frames) / seconds,
                 100 * Double(dirtyPx) / Double(f * max(W * H, 1)), raw / 1024))
    print("way                  KB/frame   p95 KB   max KB   Mbit/s   vs whole frames   encode ms/frame")
    for w in ways {
        let s = w.bytes.sorted(), tot = s.reduce(0, +)
        let p95 = s.isEmpty ? 0 : s[min(s.count - 1, s.count * 95 / 100)]
        print(w.name.padding(toLength: 20, withPad: " ", startingAt: 0) + String(format: " %8.1f %8.1f %8.1f %8.1f %12.0fx %12.2f", Double(tot) / Double(f) / 1024, Double(p95) / 1024,
                     Double(s.last ?? 0) / 1024, Double(tot) * 8 / seconds / 1e6, Double(raw * f) / Double(max(tot, 1)), w.ms / Double(f)))
    }
    exit(0)
}
RunLoop.main.run()
