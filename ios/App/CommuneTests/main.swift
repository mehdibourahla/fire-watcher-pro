import Foundation

func check(_ condition: Bool, _ message: String) {
    if !condition { print("FAIL: \(message)"); exit(1) }
}

let root = URL(fileURLWithPath: CommandLine.arguments[1])
let resolver = try CommuneResolver(json: Data(contentsOf: root.appendingPathComponent("public/geo/communes.v1.json")))
let fixture = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("data/geo/commune-fixture.json"))) as! [[String: Any]]
for point in fixture {
    let expected = point["code"] as? String
    let actual = resolver.resolve(lon: point["lon"] as! Double, lat: point["lat"] as! Double)
    check(actual == expected, "fixture \(point) resolved to \(String(describing: actual))")
}
check(TopicPlan.plan(old: "1501", new: "1502", oldLang: "ar", newLang: "ar", pinned: []) ==
      [.init(join: false, topic: "v1.commune.1501.ar"), .init(join: true, topic: "v1.commune.1502.ar")], "swap")
check(TopicPlan.plan(old: "1501", new: "1502", oldLang: "ar", newLang: "ar", pinned: ["1501", "1502"]).isEmpty, "pinned")
check(TopicPlan.plan(old: "1501", new: nil, oldLang: "ar", newLang: "ar", pinned: []) ==
      [.init(join: true, topic: "v1.commune.1501.ar")], "sea re-asserts commune")
check(TopicPlan.plan(old: "1501", new: "1501", oldLang: "ar", newLang: "ar", pinned: []) ==
      [.init(join: true, topic: "v1.commune.1501.ar")], "re-assert on every fix")
check(TopicPlan.plan(old: "1501", new: "1501", oldLang: "ar", newLang: "ar", pinned: ["1501"]).isEmpty, "manual owns")
check(TopicPlan.plan(old: "1501", new: "1501", oldLang: "ar", newLang: "fr", pinned: []) ==
      [.init(join: false, topic: "v1.commune.1501.ar"), .init(join: true, topic: "v1.commune.1501.fr")], "language")
check(TopicPlan.repin(current: "1501", oldLang: "ar", newLang: "ar", oldPinned: ["1501"], newPinned: []) ==
      [.init(join: true, topic: "v1.commune.1501.ar")], "take over when unpinned")
check(TopicPlan.repin(current: "1501", oldLang: "ar", newLang: "ar", oldPinned: [], newPinned: ["1501"]).isEmpty, "never drop the manual topic")
check(TopicPlan.repin(current: "1501", oldLang: "ar", newLang: "fr", oldPinned: [], newPinned: ["1501"]) ==
      [.init(join: false, topic: "v1.commune.1501.ar")], "drop own other-language topic")
check(TopicPlan.repin(current: "1501", oldLang: "ar", newLang: "fr", oldPinned: [], newPinned: []) ==
      [.init(join: false, topic: "v1.commune.1501.ar"), .init(join: true, topic: "v1.commune.1501.fr")], "repin language")
check(TopicPlan.repin(current: nil, oldLang: "ar", newLang: "fr", oldPinned: ["1501"], newPinned: []).isEmpty, "no commune")
print("PASS \(fixture.count) fixture points")
