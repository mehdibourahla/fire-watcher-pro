import Capacitor
import Foundation

@objc(CurrentCommunePlugin)
public class CurrentCommunePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CurrentCommunePlugin"
    public let jsName = "CurrentCommune"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPinned", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestBackground", returnType: CAPPluginReturnPromise)
    ]

    private let tracker = CommuneTracker.shared

    private func status() -> [String: Any] {
        [
            "enabled": tracker.enabled,
            "commune": tracker.commune as Any,
            "updatedAt": tracker.updatedAt as Any,
            "background": tracker.background
        ]
    }

    private func pinned(_ call: CAPPluginCall) -> Set<String> {
        Set((call.getArray("pinned") ?? []).compactMap { $0 as? String })
    }

    @objc func status(_ call: CAPPluginCall) { call.resolve(status()) }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [self] in
            tracker.enable(lang: call.getString("lang") ?? "ar", pinned: pinned(call)) { ok in
                ok ? call.resolve(self.status()) : call.reject("location_denied")
            }
        }
    }

    @objc func requestBackground(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [self] in tracker.requestBackground { call.resolve(self.status()) } }
    }

    @objc func setPinned(_ call: CAPPluginCall) {
        tracker.setPinned(pinned(call), lang: call.getString("lang") ?? "ar")
        call.resolve(status())
    }

    @objc func stop(_ call: CAPPluginCall) {
        tracker.disable()
        call.resolve(status())
    }
}
