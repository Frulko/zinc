// usbmux: a connection to a TCP port of an iPad or an iPhone on the USB cable, through macOS's usbmuxd (/var/run/usbmuxd), the channel
// Xcode and the Finder use; the cable charges the device meanwhile. The protocol is the one libimobiledevice's libusbmuxd speaks: plist
// messages behind a 16-byte header [u32 length][u32 version 1][u32 type 8, plist][u32 tag], little-endian; after a Connect answered 0 the
// socket is the connection to the device's port, byte for byte.
import Foundation

private func usbmuxOpen() -> Int32 {
    let s = socket(AF_UNIX, SOCK_STREAM, 0)
    var a = sockaddr_un(); a.sun_family = sa_family_t(AF_UNIX)
    withUnsafeMutableBytes(of: &a.sun_path) { p in "/var/run/usbmuxd".utf8CString.withUnsafeBytes { p.copyMemory(from: $0) } }
    let ok = withUnsafePointer(to: &a) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(s, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) } } == 0
    if !ok { close(s); return -1 }
    var tv = timeval(tv_sec: 2, tv_usec: 0)   // usbmuxd answers at once; only its answers wait this long, the connection after has none
    setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
    return s
}
private func usbmuxAsk(_ s: Int32, _ message: [String: Any]) -> [String: Any]? {
    var m = message; m["ClientVersionString"] = "zinc-sidecar"; m["ProgName"] = "sidecar-screen"
    guard let body = try? PropertyListSerialization.data(fromPropertyList: m, format: .xml, options: 0) else { return nil }
    var out = Data()
    for v in [UInt32(16 + body.count), 1, 8, 1] { withUnsafeBytes(of: v.littleEndian) { out.append(contentsOf: $0) } }
    out.append(body)
    guard out.withUnsafeBytes({ write(s, $0.baseAddress!, out.count) }) == out.count else { return nil }
    func readAll(_ n: Int) -> [UInt8]? {
        var b = [UInt8](repeating: 0, count: n), got = 0
        while got < n { let r = read(s, &b[got], n - got); if r <= 0 { return nil }; got += r }
        return b
    }
    guard let h = readAll(16) else { return nil }
    let len = Int(UInt32(h[0]) | UInt32(h[1]) << 8 | UInt32(h[2]) << 16 | UInt32(h[3]) << 24)
    guard len >= 16, len < 1 << 20, let b = readAll(len - 16) else { return nil }
    return (try? PropertyListSerialization.propertyList(from: Data(b), format: nil)) as? [String: Any]
}
/** The devices on a USB cable (usbmuxd also lists the ones paired over Wi-Fi: those are left out). */
func usbmuxDevices() -> [(id: Int, serial: String)] {
    let s = usbmuxOpen(); if s < 0 { return [] }
    defer { close(s) }
    let list = usbmuxAsk(s, ["MessageType": "ListDevices"])?["DeviceList"] as? [[String: Any]] ?? []
    return list.compactMap { d in
        guard let id = d["DeviceID"] as? Int, let p = d["Properties"] as? [String: Any], p["ConnectionType"] as? String == "USB" else { return nil }
        return (id, p["SerialNumber"] as? String ?? "")
    }
}
/** A connection to `port` on the device with this serial (its UDID), or on the first one on a cable; -1 when none answers there. */
func usbmuxConnect(_ port: UInt16, serial: String = "") -> Int32 {
    guard let d = usbmuxDevices().first(where: { serial.isEmpty || $0.serial == serial }) else { return -1 }
    let s = usbmuxOpen(); if s < 0 { return -1 }
    // PortNumber is the port in network order, read as a host integer
    guard let r = usbmuxAsk(s, ["MessageType": "Connect", "DeviceID": d.id, "PortNumber": Int(port.bigEndian)]), r["Number"] as? Int == 0 else { close(s); return -1 }
    var tv = timeval(); setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
    return s
}
