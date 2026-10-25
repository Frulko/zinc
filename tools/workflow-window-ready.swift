import Foundation
import CoreGraphics

let pid = Int(CommandLine.arguments[1])!
let deadline = ProcessInfo.processInfo.systemUptime + 25
while ProcessInfo.processInfo.systemUptime < deadline {
    let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] ?? []
    for row in windows where (row[kCGWindowOwnerPID as String] as? Int) == pid {
        guard (row[kCGWindowLayer as String] as? Int) == 0,
              let bounds = row[kCGWindowBounds as String] as? [String: Any],
              let width = bounds["Width"] as? Double, let height = bounds["Height"] as? Double,
              width > 80, height > 80 else { continue }
        let result: [String: Any] = ["seen_monotonic_ns": DispatchTime.now().uptimeNanoseconds, "bounds": bounds]
        print(String(data: try! JSONSerialization.data(withJSONObject: result), encoding: .utf8)!)
        exit(0)
    }
    usleep(20_000)
}
exit(1)
