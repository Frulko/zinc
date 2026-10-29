// adb: a connection to a TCP port of an Android device on the USB cable, through the adb server of this Mac (127.0.0.1:5037), the way
// `adb forward` reaches it but with no port to set up: "host:transport:<serial>" (or "host:transport-usb") then "tcp:<port>", each a
// 4-hex-digit length and the request, each answered OKAY or FAIL; after them the socket is the connection to the device's port. The cable
// charges the device meanwhile.
import Foundation

/** adb itself: ANDROID_HOME's, the SDK's default place, else the PATH's (to start its server when none answers). */
private func adbPath() -> String? {
    let home = FileManager.default.homeDirectoryForCurrentUser.path
    let env = ProcessInfo.processInfo.environment
    let found = [env["ANDROID_HOME"], env["ANDROID_SDK_ROOT"], home + "/Library/Android/sdk"].compactMap { $0 }.map { $0 + "/platform-tools/adb" }
        + ["/opt/homebrew/bin/adb", "/usr/local/bin/adb"]
    return found.first { FileManager.default.isExecutableFile(atPath: $0) }
}
private func adbServer() -> Int32 {
    func open() -> Int32 {
        let s = socket(AF_INET, SOCK_STREAM, 0)
        var a = sockaddr_in(); a.sin_family = sa_family_t(AF_INET); a.sin_port = UInt16(5037).bigEndian; a.sin_addr.s_addr = inet_addr("127.0.0.1")
        if withUnsafePointer(to: &a, { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(s, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }) == 0 { return s }
        close(s); return -1
    }
    var s = open()
    if s < 0, let adb = adbPath() {   // no server yet: adb starts one and returns once it listens
        let p = Process(); p.executableURL = URL(fileURLWithPath: adb); p.arguments = ["start-server"]
        p.standardOutput = FileHandle.nullDevice; p.standardError = FileHandle.nullDevice
        if (try? p.run()) != nil { p.waitUntilExit(); s = open() }
    }
    return s
}
/** One request, answered OKAY (true) or FAIL. */
private func adbAsk(_ s: Int32, _ request: String) -> Bool {
    let m = Array(String(format: "%04x", request.utf8.count).utf8) + Array(request.utf8)
    guard write(s, m, m.count) == m.count else { return false }
    var r = [UInt8](repeating: 0, count: 4), got = 0
    while got < 4 { let n = read(s, &r[got], 4 - got); if n <= 0 { return false }; got += n }
    return r == Array("OKAY".utf8)
}
/** A connection to `port` on the device with this serial, or on the one device on a cable; -1 when none answers there. */
func adbConnect(_ port: UInt16, serial: String = "") -> Int32 {
    let s = adbServer(); if s < 0 { return -1 }
    guard adbAsk(s, serial.isEmpty ? "host:transport-usb" : "host:transport:" + serial), adbAsk(s, "tcp:\(port)") else { close(s); return -1 }
    return s
}
/** The serials of the devices adb sees on a cable and ready ("device", not "unauthorized" or "offline"). */
func adbDevices() -> [String] {
    let s = adbServer(); if s < 0 { return [] }
    defer { close(s) }
    guard adbAsk(s, "host:devices") else { return [] }
    var len = [UInt8](repeating: 0, count: 4), got = 0
    while got < 4 { let n = read(s, &len[got], 4 - got); if n <= 0 { return [] }; got += n }
    let total = Int(String(decoding: len, as: UTF8.self), radix: 16) ?? 0
    var body = [UInt8](repeating: 0, count: total); got = 0
    while got < total { let n = read(s, &body[got], total - got); if n <= 0 { break }; got += n }
    return String(decoding: body, as: UTF8.self).split(separator: "\n").compactMap { l in
        let w = l.split(separator: "\t"); return w.count == 2 && w[1] == "device" && !w[0].contains(":") ? String(w[0]) : nil   // host:port is adb over Wi-Fi
    }
}
