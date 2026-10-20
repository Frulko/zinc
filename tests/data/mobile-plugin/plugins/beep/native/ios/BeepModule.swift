import Foundation

/// The fixture's module on iOS, in Swift behind the generated ZincBeepSpec (zinc native-gen --ios).
@objc(BeepModule) public class BeepModule: NSObject, ZincBeepSpec {
  public func ping() -> Int32 { 42 }

  public func greet(_ name: String, loud: Bool) -> String {
    let s = "hello \(name) from Swift"
    return loud ? s.uppercased() : s
  }

  public func watch(_ cb: @escaping (Int32, String) -> Void) {
    DispatchQueue.global().asyncAfter(deadline: .now() + 0.2) {
      cb(1, "swift")
      cb(2, "swift")
    }
  }
}

/// The fixture's lifecycle subscriber (plugin.json targets.ios.lifecycle): src/app/ios_glue.mm calls the methods it answers.
@objc(BeepLife) public class BeepLife: NSObject {
  @objc public func zincResume() { NSLog("beep lifecycle resume") }
}
