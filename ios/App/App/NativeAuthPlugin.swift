import AuthenticationServices
import Capacitor
import CryptoKit

@objc(NativeAuthPlugin)
public class NativeAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeAuthPlugin"
    public let jsName = "NativeAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "browse", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "apple", returnType: CAPPluginReturnPromise)
    ]

    private var session: ASWebAuthenticationSession?
    private var appleCall: CAPPluginCall?

    private var anchor: ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    @objc func browse(_ call: CAPPluginCall) {
        guard let url = call.getString("url").flatMap(URL.init(string:)) else {
            return call.reject("invalid url")
        }
        DispatchQueue.main.async { [self] in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "app.nadhir") { callback, error in
                self.session = nil
                if let callback {
                    call.resolve(["url": callback.absoluteString])
                } else if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin {
                    call.reject("cancelled", "cancelled")
                } else {
                    call.reject(error?.localizedDescription ?? "sign-in failed", "failed", error)
                }
            }
            session.presentationContextProvider = self
            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("sign-in could not start", "failed")
            }
        }
    }

    @objc func apple(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce") else { return call.reject("missing nonce") }
        DispatchQueue.main.async { [self] in
            appleCall?.reject("superseded", "cancelled")
            appleCall = call
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }
}

extension NativeAuthPlugin: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { anchor }
}

extension NativeAuthPlugin: ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { anchor }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        defer { appleCall = nil }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let token = credential.identityToken.flatMap({ String(data: $0, encoding: .utf8) }) else {
            appleCall?.reject("no identity token", "failed")
            return
        }
        var result: [String: Any] = ["idToken": token]
        if let given = credential.fullName?.givenName { result["givenName"] = given }
        if let family = credential.fullName?.familyName { result["familyName"] = family }
        appleCall?.resolve(result)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        defer { appleCall = nil }
        let cancelled = (error as? ASAuthorizationError)?.code == .canceled
        appleCall?.reject(cancelled ? "cancelled" : error.localizedDescription, cancelled ? "cancelled" : "failed", error)
    }
}
