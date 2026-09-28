package app.nadhir.commune;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import com.google.android.gms.location.LocationResult;

public class CommuneLocationReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        LocationResult result = LocationResult.extractResult(intent);
        if (result == null) return;
        Location location = result.getLastLocation();
        if (location == null) return;
        PendingResult pending = goAsync();
        Context app = context.getApplicationContext();
        CommuneTracker.run(() -> {
            try {
                CommuneTracker.onLocation(app, location.getLongitude(), location.getLatitude());
            } finally {
                pending.finish();
            }
        });
    }
}
