import Foundation

struct CommuneResolver {
    private let codes: [String]
    private let boxes: [[Double]]
    private let polygons: [[[[Double]]]]

    init(json: Data) throws {
        guard let root = try JSONSerialization.jsonObject(with: json) as? [String: Any],
              let communes = root["communes"] as? [[String: Any]] else {
            throw NSError(domain: "CommuneResolver", code: 1)
        }
        var codes: [String] = []
        var boxes: [[Double]] = []
        var polygons: [[[[Double]]]] = []
        for commune in communes {
            guard let code = commune["c"] as? String,
                  let box = commune["b"] as? [Double],
                  let rings = commune["p"] as? [[[[Double]]]] else {
                throw NSError(domain: "CommuneResolver", code: 2)
            }
            codes.append(code)
            boxes.append(box)
            polygons.append(rings.map { polygon in polygon.map { ring in ring.flatMap { $0 } } })
        }
        self.codes = codes
        self.boxes = boxes
        self.polygons = polygons
    }

    private static func inRing(_ ring: [Double], _ lon: Double, _ lat: Double) -> Bool {
        var inside = false
        let count = ring.count / 2
        var j = count - 1
        for i in 0..<count {
            let xi = ring[2 * i], yi = ring[2 * i + 1]
            let xj = ring[2 * j], yj = ring[2 * j + 1]
            if (yi > lat) != (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi { inside.toggle() }
            j = i
        }
        return inside
    }

    func resolve(lon: Double, lat: Double) -> String? {
        for (index, box) in boxes.enumerated() {
            if lon < box[0] || lat < box[1] || lon > box[2] || lat > box[3] { continue }
            for rings in polygons[index] {
                var inside = false
                for ring in rings where CommuneResolver.inRing(ring, lon, lat) { inside.toggle() }
                if inside { return codes[index] }
            }
        }
        return nil
    }
}

enum TopicPlan {
    struct Op: Equatable {
        let join: Bool
        let topic: String
    }

    static func topic(_ code: String, _ lang: String) -> String { "v1.commune.\(code).\(lang)" }

    static func plan(old: String?, new: String?, oldLang: String, newLang: String, pinned: Set<String>) -> [Op] {
        let target = new ?? old
        // re-joining the held topic on every fix heals token rotation and ops that failed or landed late
        if old == target && oldLang == newLang {
            guard let target, !pinned.contains(target) else { return [] }
            return [Op(join: true, topic: topic(target, newLang))]
        }
        var ops: [Op] = []
        if let old, !pinned.contains(old) { ops.append(Op(join: false, topic: topic(old, oldLang))) }
        if let target, !pinned.contains(target) { ops.append(Op(join: true, topic: topic(target, newLang))) }
        return ops
    }

    static func repin(current: String?, oldLang: String, newLang: String, oldPinned: Set<String>, newPinned: Set<String>) -> [Op] {
        guard let current else { return [] }
        let wasPinned = oldPinned.contains(current)
        let isPinned = newPinned.contains(current)
        if wasPinned && !isPinned { return [Op(join: true, topic: topic(current, newLang))] }
        if !wasPinned && isPinned { return oldLang == newLang ? [] : [Op(join: false, topic: topic(current, oldLang))] }
        if !wasPinned && oldLang != newLang {
            return [Op(join: false, topic: topic(current, oldLang)), Op(join: true, topic: topic(current, newLang))]
        }
        return []
    }
}
