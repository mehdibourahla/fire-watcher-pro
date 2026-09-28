package app.nadhir.commune;

import android.Manifest;
import android.annotation.SuppressLint;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONException;

@CapacitorPlugin(
    name = "CurrentCommune",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "background", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION })
    }
)
public class CurrentCommunePlugin extends Plugin {

    private static Set<String> pinned(PluginCall call) {
        Set<String> out = new HashSet<>();
        JSArray array = call.getArray("pinned", new JSArray());
        try {
            for (int i = 0; i < array.length(); i++) out.add(array.getString(i));
        } catch (JSONException error) {
            call.reject("invalid pinned communes");
        }
        return out;
    }

    private boolean backgroundGranted() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || getPermissionState("background") == PermissionState.GRANTED;
    }

    private JSObject status() {
        JSObject out = new JSObject();
        out.put("enabled", CommuneTracker.enabled(getContext()));
        out.put("commune", CommuneTracker.commune(getContext()));
        long updatedAt = CommuneTracker.updatedAt(getContext());
        out.put("updatedAt", updatedAt == 0 ? null : updatedAt);
        out.put("background", backgroundGranted());
        return out;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) requestPermissionForAlias("location", call, "afterLocation");
        else afterLocation(call);
    }

    @SuppressLint("MissingPermission")
    @PermissionCallback
    private void afterLocation(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("location_denied");
            return;
        }
        CommuneTracker.enable(getContext(), call.getString("lang", "ar"), pinned(call));
        LocationServices.getFusedLocationProviderClient(getContext())
            .getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, null)
            .addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null) {
                    new Thread(() -> {
                        CommuneTracker.onLocation(getContext(), task.getResult().getLongitude(), task.getResult().getLatitude());
                        call.resolve(status());
                    }).start();
                } else call.resolve(status());
            });
    }

    @PluginMethod
    public void requestBackground(PluginCall call) {
        if (backgroundGranted()) call.resolve(status());
        else requestPermissionForAlias("background", call, "afterBackground");
    }

    @PermissionCallback
    private void afterBackground(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void setPinned(PluginCall call) {
        CommuneTracker.setPinned(getContext(), pinned(call), call.getString("lang", "ar"));
        call.resolve(status());
    }

    @PluginMethod
    public void stop(PluginCall call) {
        CommuneTracker.disable(getContext());
        call.resolve(status());
    }
}
