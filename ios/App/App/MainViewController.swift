import Capacitor
import UIKit

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(CurrentCommunePlugin())
        bridge?.registerPluginInstance(NativeAuthPlugin())
    }
}
