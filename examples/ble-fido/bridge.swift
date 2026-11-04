// Pont BLE <-> U2F (FIDO1) pour macOS : une session persistante pilotée par stdin, sans navigateur.
// Usage : swiftc -O -o /tmp/ble-fido-demo bridge.swift && /tmp/ble-fido-demo   (l'app examples/ble-fido le fait pour vous)
// Commandes (une par ligne sur stdin) :  version | register | auth <keyhandle-hex> <pubkey-hex> | quit
// Sortie (une ligne par évènement) :     STATE scan|found <nom>|ready|lost   OP <op> touch   OK <op> …   ERR <op> …
// Appairez la clé UNE fois : la connexion reste ouverte, on enchaîne ensuite autant d'opérations qu'on veut.
// ponytail: la signature d'attestation du REGISTER n'est pas vérifiée (celle de l'AUTHENTICATE l'est, avec la clé publique enregistrée).
import CoreBluetooth
import CryptoKit
import Foundation
setvbuf(stdout, nil, _IONBF, 0)

// FIDO BLE : control point F1D0FFF1 (écriture), status F1D0FFF2 (notifications).
// Trame : [cmd, lenHi, lenLo, données…] puis [seq, données…]
let CP = CBUUID(string: "F1D0FFF1-DEAA-ECEE-B42F-C9BA7ED623BB")
let ST = CBUUID(string: "F1D0FFF2-DEAA-ECEE-B42F-C9BA7ED623BB")

func hex<S: Sequence>(_ d: S) -> String where S.Element == UInt8 { d.map { String(format: "%02x", $0) }.joined() }
func unhex(_ s: String) -> [UInt8] {
  var r = [UInt8](), i = s.startIndex
  while i < s.endIndex { let j = s.index(i, offsetBy: 2, limitedBy: s.endIndex) ?? s.endIndex; if let b = UInt8(s[i..<j], radix: 16) { r.append(b) }; i = j }
  return r
}
func rand32() -> [UInt8] { (0..<32).map { _ in UInt8.random(in: 0...255) } }
func swHex(_ sw: UInt16) -> String { String(format: "%04x", sw) }

// « Application » U2F de la démo (l'équivalent de l'origine d'un site web).
let appParam = [UInt8](SHA256.hash(data: Data("https://zinc.demo".utf8)))

// APDU U2F à longueur étendue : CLA INS P1 P2 00 Lc(2) data Le(2)
func apdu(_ ins: UInt8, _ p1: UInt8 = 0, _ data: [UInt8] = []) -> [UInt8] {
  data.isEmpty ? [0, ins, p1, 0, 0, 0, 0] : [0, ins, p1, 0, 0, UInt8(data.count >> 8), UInt8(data.count & 0xff)] + data + [0, 0]
}

class D: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
  var m: CBCentralManager!; var p: CBPeripheral?; var cp: CBCharacteristic?; var st: CBCharacteristic?
  var connecting = false, ready = false, busy = false, retrying = false, signaled = false, tries = 0, pairTries = 0, reconnects = 0, expect = 0
  var buf = Data()
  var cur: (name: String, pl: [UInt8], touch: Bool)?
  var pending: ((UInt16, [UInt8]) -> Void)?

  override init() { super.init(); m = CBCentralManager(delegate: self, queue: nil) }

  // ---- connexion ----
  // On ne se connecte QU'à une clé en mode appairage (octet d'état FIDO, bit 7). En mode normal, elle refuse tout appairage et raccroche, et macOS ne mémorise pas
  // l'appairage de cette clé (debug LTK) : se connecter trop tôt, à l'annonce « normale » d'avant le maintien du bouton, ferait échouer toute la séquence.
  // AllowDuplicates : on reçoit chaque annonce, donc le passage de « normal » à « appairage » en cours de scan.
  func startScan(_ c: CBCentralManager) {
    c.scanForPeripherals(withServices: [CBUUID(string: "FFFD")], options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
  }
  func centralManagerDidUpdateState(_ c: CBCentralManager) {
    if c.state == .poweredOn { print("STATE scan"); startScan(c) }
    else if c.state == .unauthorized { print("ERR connexion Bluetooth non autorisé pour ce programme"); exit(1) }
  }
  var waitingShown = false
  func centralManager(_ c: CBCentralManager, didDiscover x: CBPeripheral, advertisementData a: [String: Any], rssi: NSNumber) {
    if connecting { return }
    let flags = ((a[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data])?[CBUUID(string: "FFFD")])?.first ?? 0
    guard flags & 0x80 != 0 else {
      if !waitingShown { waitingShown = true; print("STATE waiting \(x.name ?? "?") normal flags=\(String(format: "%02x", flags))") }   // clé détectée mais pas en appairage : on attend
      return
    }
    connecting = true; waitingShown = false
    print("STATE found \(x.name ?? "?") pairing flags=\(String(format: "%02x", flags)) id=\(x.identifier.uuidString.prefix(8))"); p = x; c.stopScan(); c.connect(x)
  }
  func centralManager(_ c: CBCentralManager, didConnect x: CBPeripheral) { x.delegate = self; print("STATE connected"); x.discoverServices([CBUUID(string: "FFFD")]) }
  // Échec ou coupure avant la fin de l'appairage : l'objet CBPeripheral peut être périmé (« Device is invalid »), on repart d'un scan pour en obtenir un neuf.
  func retry(_ c: CBCentralManager, _ why: String) {
    guard reconnects < 4 else { print("ERR \(why)"); exit(3) }
    reconnects += 1; print("connexion perdue (\(why)), nouvelle tentative \(reconnects)/4…")
    cp = nil; st = nil; p = nil; connecting = false
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { c.stopScan(); self.startScan(c) }
  }
  func centralManager(_ c: CBCentralManager, didFailToConnect x: CBPeripheral, error e: Error?) { retry(c, e?.localizedDescription ?? "connexion refusée") }
  func centralManager(_ c: CBCentralManager, didDisconnectPeripheral x: CBPeripheral, error e: Error?) {
    let why = e.map { "\(($0 as NSError).domain) code=\(($0 as NSError).code) \($0.localizedDescription)" } ?? "sans erreur"
    print("DBG déconnexion: \(why)")   // code 14 = « peer removed pairing information » : la clé a perdu l'appairage
    if ready { print("STATE lost"); exit(3) }
    retry(c, "coupée avant la fin de l'appairage")
  }
  func peripheral(_ x: CBPeripheral, didDiscoverServices e: Error?) { for s in x.services ?? [] { x.discoverCharacteristics([CP, ST], for: s) } }
  func peripheral(_ x: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error e: Error?) {
    for ch in s.characteristics ?? [] { if ch.uuid == CP { cp = ch } else if ch.uuid == ST { st = ch } }
    if let st = st { x.setNotifyValue(true, for: st) }   // peut ouvrir la fenêtre d'appairage de macOS
  }
  func peripheral(_ x: CBPeripheral, didUpdateNotificationStateFor ch: CBCharacteristic, error e: Error?) {
    if let e = e { print("ERR appairage: \(e.localizedDescription)"); exit(1) }
    if ch.isNotifying {
      ready = true; print("STATE ready")
    }
  }

  // ---- une opération U2F à la fois ----
  func run(_ name: String, _ pl: [UInt8], touch: Bool = false, _ done: @escaping (UInt16, [UInt8]) -> Void) {
    guard ready else { print("ERR \(name) clé non connectée"); return }
    guard !busy else { print("ERR \(name) une opération est déjà en cours"); return }
    busy = true; signaled = false; tries = 0; pairTries = 0; cur = (name, pl, touch); pending = done; attempt()
  }
  func attempt() {
    guard let x = p, let cp = cp, let c = cur else { return }
    buf = Data(); expect = 0; retrying = false
    let mtu = 20   // ponytail: la clé n'annonce pas F1D0FFF4 (taille du control point) → 20 o, minimum de la spec
    let pl = c.pl
    var first = Data([0x83, UInt8(pl.count >> 8), UInt8(pl.count & 0xff)])
    let n1 = min(mtu - 3, pl.count); first.append(contentsOf: pl[0..<n1]); x.writeValue(first, for: cp, type: .withResponse)
    var off = n1, seq: UInt8 = 0
    while off < pl.count { let n = min(mtu - 1, pl.count - off); var f = Data([seq]); f.append(contentsOf: pl[off..<off + n]); x.writeValue(f, for: cp, type: .withResponse); off += n; seq += 1 }
  }
  func peripheral(_ x: CBPeripheral, didWriteValueFor ch: CBCharacteristic, error e: Error?) {
    guard let e = e, let c = cur else { return }
    // « Encryption/Authentication insufficient » : la clé veut un lien chiffré, macOS ouvre sa fenêtre d'appairage. On réessaie (jusqu'à 60 s) le temps qu'on l'accepte.
    let ns = e as NSError
    if ns.domain == CBATTErrorDomain && (ns.code == 15 || ns.code == 5) && pairTries < 30 {
      print("DBG écriture refusée: att code=\(ns.code)")
      if retrying { return }
      retrying = true; pairTries += 1; if pairTries == 1 { print("OP pairing") }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.attempt() }; return
    }
    print("ERR \(c.name) écriture refusée: \(e.localizedDescription)"); cur = nil; busy = false; pending = nil
  }
  func peripheral(_ x: CBPeripheral, didUpdateValueFor ch: CBCharacteristic, error e: Error?) {
    guard cur != nil, let v = ch.value, !v.isEmpty else { return }
    if expect == 0 {
      if v[0] == 0x82 {                                            // keepalive : la clé travaille ou attend un toucher (statut 2)
        if let c = cur, c.touch, !signaled, v.count > 1, v[1] == 0x02 { signaled = true; print("OP \(c.name) touch") }
        return
      }
      if v[0] == 0xbf { finish(Data([0xff, 0xff])); return }       // erreur FIDO BLE
      expect = Int(v[1]) << 8 | Int(v[2]); buf.append(v.dropFirst(3))
    } else { buf.append(v.dropFirst(1)) }
    if buf.count >= expect { finish(Data(buf.prefix(expect))) }
  }
  func finish(_ r: Data) {
    guard let c = cur else { return }
    let sw = r.count >= 2 ? (UInt16(r[r.count - 2]) << 8 | UInt16(r[r.count - 1])) : 0
    let body = [UInt8](r.dropLast(2))
    // 6985 = « touchez la clé » : on redemande toutes les 250 ms, jusqu'à 25 s
    if sw == 0x6985 && c.touch && tries < 100 {
      tries += 1; if tries == 1 && !signaled { signaled = true; print("OP \(c.name) touch") }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.attempt() }; return
    }
    let d = pending; cur = nil; busy = false; pending = nil; d?(sw, body)
  }

  // ---- commandes ----
  func command(_ line: String) {
    let a = line.split(separator: " ").map(String.init)
    switch a.first ?? "" {
    case "version":
      run("version", apdu(0x03)) { sw, b in
        print(sw == 0x9000 ? "OK version \(String(decoding: b, as: UTF8.self))" : "ERR version sw=\(swHex(sw))")
      }
    case "register":
      let ch = rand32()
      run("register", apdu(0x01, 0, ch + appParam), touch: true) { sw, b in
        guard sw == 0x9000, b.count > 67, b[0] == 0x05, b.count >= 67 + Int(b[66]) else { print(sw == 0x6985 ? "ERR register clé non touchée (délai dépassé)" : "ERR register sw=\(swHex(sw))"); return }
        print("OK register \(hex(b[1..<66])) \(hex(b[67..<(67 + Int(b[66]))]))")
      }
    case "auth" where a.count == 3:
      let kh = unhex(a[1]), pub = unhex(a[2]), ch = rand32()
      run("auth", apdu(0x02, 0x03, ch + appParam + [UInt8(kh.count)] + kh), touch: true) { sw, b in
        if sw == 0x6a80 { print("ERR auth key handle refusé : cette clé ne le connaît pas"); return }
        guard sw == 0x9000, b.count > 5 else { print(sw == 0x6985 ? "ERR auth clé non touchée (délai dépassé)" : "ERR auth sw=\(swHex(sw))"); return }
        let counter = b[1..<5].reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
        let signed = Data(appParam + [b[0]] + Array(b[1..<5]) + ch)   // spec U2F : appParam | présence | compteur | challenge
        var ok = false
        if let k = try? P256.Signing.PublicKey(x963Representation: Data(pub)), let s = try? P256.Signing.ECDSASignature(derRepresentation: Data(b[5...])) {
          ok = k.isValidSignature(s, for: signed)
        }
        print("OK auth presence=\(b[0]) counter=\(counter) signature=\(ok ? "VALIDE" : "INVALIDE")")
      }
    case "quit": exit(0)
    default: print("ERR commande inconnue: \(line)")
    }
  }
}

let dev = D()
FileHandle.standardInput.readabilityHandler = { h in
  let d = h.availableData
  if d.isEmpty { h.readabilityHandler = nil; return }       // stdin fermé : on reste vivant
  for l in String(decoding: d, as: UTF8.self).split(separator: "\n") { let s = String(l); DispatchQueue.main.async { dev.command(s) } }
}
DispatchQueue.main.asyncAfter(deadline: .now() + 240) { if !dev.ready { print("ERR timeout : clé introuvable (remettez-la en mode appairage)"); exit(2) } }
RunLoop.main.run()
