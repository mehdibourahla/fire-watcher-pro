import CoreLocation
import FirebaseCore
import FirebaseMessaging
import UIKit

final class CommuneTracker: NSObject, CLLocationManagerDelegate {
    static let shared = CommuneTracker()

    private let manager = CLLocationManager()
    private let defaults = UserDefaults.standard
    private let queue = DispatchQueue(label: "app.nadhir.commune")
    private var resolver: CommuneResolver?
    private var authorizationWaiters: [() -> Void] = []

    override private init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    var enabled: Bool { defaults.bool(forKey: "commune.enabled") }
    var commune: String? { defaults.string(forKey: "commune.code") }
    var updatedAt: Double? { defaults.object(forKey: "commune.updatedAt") as? Double }
    var background: Bool { manager.authorizationStatus == .authorizedAlways }
    var authorized: Bool { [.authorizedAlways, .authorizedWhenInUse].contains(manager.authorizationStatus) }

    // iOS relaunches the app without a scene for significant-change events, so this runs from AppDelegate
    func resumeIfEnabled() {
        guard enabled, authorized else { return }
        manager.startMonitoringSignificantLocationChanges()
    }

    func enable(lang: String, pinned: Set<String>, completion: @escaping (Bool) -> Void) {
        let proceed = { [weak self] in
            guard let self, self.authorized else { return completion(false) }
            self.setPinned(pinned, lang: lang)
            self.defaults.set(true, forKey: "commune.enabled")
            self.manager.startMonitoringSignificantLocationChanges()
            self.manager.requestLocation()
            completion(true)
        }
        if manager.authorizationStatus == .notDetermined {
            authorizationWaiters.append(proceed)
            manager.requestWhenInUseAuthorization()
        } else {
            proceed()
        }
    }

    func requestBackground(completion: @escaping () -> Void) {
        guard manager.authorizationStatus == .authorizedWhenInUse else { return completion() }
        authorizationWaiters.append(completion)
        manager.requestAlwaysAuthorization()
    }

    func disable() {
        manager.stopMonitoringSignificantLocationChanges()
        queue.async { [self] in
            if let current = commune, !pinned.contains(current) {
                ensureFirebase()
                Messaging.messaging().unsubscribe(fromTopic: TopicPlan.topic(current, lang))
            }
            defaults.set(false, forKey: "commune.enabled")
            defaults.removeObject(forKey: "commune.code")
            defaults.removeObject(forKey: "commune.updatedAt")
        }
    }

    func setPinned(_ pinned: Set<String>, lang: String) {
        queue.async { [self] in
            let current = commune
            let ops = TopicPlan.plan(old: current, new: current, oldLang: self.lang, newLang: lang, pinned: pinned)
            if apply(ops) {
                defaults.set(lang, forKey: "commune.lang")
                defaults.set(Array(pinned), forKey: "commune.pinned")
            }
        }
    }

    private var lang: String { defaults.string(forKey: "commune.lang") ?? "ar" }
    private var pinned: Set<String> { Set(defaults.stringArray(forKey: "commune.pinned") ?? []) }

    private func ensureFirebase() {
        if FirebaseApp.app() == nil { FirebaseApp.configure() }
    }

    private func loadResolver() -> CommuneResolver? {
        if resolver == nil,
           let url = Bundle.main.url(forResource: "communes.v1", withExtension: "json", subdirectory: "public/geo"),
           let data = try? Data(contentsOf: url) {
            resolver = try? CommuneResolver(json: data)
        }
        return resolver
    }

    private func apply(_ ops: [TopicPlan.Op]) -> Bool {
        guard !ops.isEmpty else { return true }
        ensureFirebase()
        var failed = false
        for op in ops {
            let done = DispatchSemaphore(value: 0)
            let finish: (Error?) -> Void = { error in
                if let error { NSLog("CurrentCommune: topic change failed: \(error)"); failed = true }
                done.signal()
            }
            if op.join { Messaging.messaging().subscribe(toTopic: op.topic, completion: finish) }
            else { Messaging.messaging().unsubscribe(fromTopic: op.topic, completion: finish) }
            if done.wait(timeout: .now() + 25) == .timedOut { failed = true }
            if failed { return false }
            NSLog("CurrentCommune: \(op.join ? "+" : "-")\(op.topic)")
        }
        return true
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard enabled, let location = locations.last else { return }
        let task = UIApplication.shared.beginBackgroundTask(withName: "commune")
        queue.async { [self] in
            defer { UIApplication.shared.endBackgroundTask(task) }
            guard let code = loadResolver()?.resolve(lon: location.coordinate.longitude, lat: location.coordinate.latitude) else { return }
            let ops = TopicPlan.plan(old: commune, new: code, oldLang: lang, newLang: lang, pinned: pinned)
            if apply(ops) {
                defaults.set(code, forKey: "commune.code")
                defaults.set(Date().timeIntervalSince1970 * 1000, forKey: "commune.updatedAt")
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        NSLog("CurrentCommune: location failed: \(error)")
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard manager.authorizationStatus != .notDetermined else { return }
        let waiters = authorizationWaiters
        authorizationWaiters.removeAll()
        waiters.forEach { $0() }
    }
}
