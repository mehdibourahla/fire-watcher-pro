package app.nadhir.auth;

import android.content.Intent;
import android.net.Uri;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeAuth")
public class NativeAuthPlugin extends Plugin {

    private PluginCall pending;

    @PluginMethod
    public void browse(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("invalid url");
            return;
        }
        if (pending != null) pending.reject("superseded", "cancelled");
        pending = call;
        new CustomTabsIntent.Builder().build().launchUrl(getActivity(), Uri.parse(url));
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        Uri data = intent.getData();
        if (pending == null || data == null || !"app.nadhir".equals(data.getScheme())) return;
        JSObject result = new JSObject();
        result.put("url", data.toString());
        pending.resolve(result);
        pending = null;
    }

    // onNewIntent always precedes onResume, so a call still pending here means the tab was closed
    @Override
    protected void handleOnResume() {
        if (pending == null) return;
        pending.reject("cancelled", "cancelled");
        pending = null;
    }
}
