package app.nadhir.commune;

import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public final class CommuneTracker {

    static final String ACTION = "app.nadhir.COMMUNE_LOCATION";
    private static final String TAG = "CurrentCommune";
    private static final String PREFS = "nadhir.commune";
    private static CommuneResolver resolver;

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static CommuneResolver resolver(Context context) throws Exception {
        if (resolver == null) {
            try (InputStream in = context.getAssets().open("public/geo/communes.v1.json")) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buffer = new byte[65536];
                for (int n; (n = in.read(buffer)) > 0; ) out.write(buffer, 0, n);
                resolver = CommuneResolver.fromJson(out.toString(StandardCharsets.UTF_8.name()));
            }
        }
        return resolver;
    }

    private static PendingIntent updatesIntent(Context context) {
        Intent intent = new Intent(context, CommuneLocationReceiver.class).setAction(ACTION);
        // location results are written into the intent, so it must stay mutable
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
    }

    @SuppressLint("MissingPermission")
    static void requestUpdates(Context context) {
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, TimeUnit.MINUTES.toMillis(15))
            .setMinUpdateIntervalMillis(TimeUnit.MINUTES.toMillis(5))
            .setMinUpdateDistanceMeters(1000f)
            .build();
        LocationServices.getFusedLocationProviderClient(context).requestLocationUpdates(request, updatesIntent(context));
    }

    // one thread owns all tracker state and blocking topic calls, off Capacitor's shared plugin thread
    private static final ExecutorService worker = Executors.newSingleThreadExecutor();

    static void run(Runnable task) {
        worker.execute(task);
    }

    public static boolean enabled(Context context) {
        return prefs(context).getBoolean("enabled", false);
    }

    public static String commune(Context context) {
        return prefs(context).getString("commune", null);
    }

    public static long updatedAt(Context context) {
        return prefs(context).getLong("updatedAt", 0);
    }

    static void enable(Context context, String lang, Set<String> pinned) {
        setPinned(context, pinned, lang);
        prefs(context).edit().putBoolean("enabled", true).apply();
        requestUpdates(context);
    }

    static void disable(Context context) {
        LocationServices.getFusedLocationProviderClient(context).removeLocationUpdates(updatesIntent(context));
        SharedPreferences prefs = prefs(context);
        String current = prefs.getString("commune", null);
        String lang = prefs.getString("lang", "ar");
        Set<String> pinned = prefs.getStringSet("pinned", new HashSet<>());
        // Firebase persists topic ops and retries them online, so turning off never waits on the network
        if (current != null && !pinned.contains(current)) FirebaseMessaging.getInstance()
            .unsubscribeFromTopic(TopicPlan.topic(current, lang))
            .addOnFailureListener(error -> Log.e(TAG, "unsubscribe failed", error));
        prefs.edit().putBoolean("enabled", false).remove("commune").remove("updatedAt").apply();
    }

    static void setPinned(Context context, Set<String> pinned, String lang) {
        SharedPreferences prefs = prefs(context);
        String current = prefs.getString("commune", null);
        String oldLang = prefs.getString("lang", lang);
        Set<String> oldPinned = prefs.getStringSet("pinned", new HashSet<>());
        apply(TopicPlan.repin(current, oldLang, lang, oldPinned, pinned));
        prefs.edit().putString("lang", lang).putStringSet("pinned", new HashSet<>(pinned)).apply();
    }

    static void onLocation(Context context, double lon, double lat) {
        SharedPreferences prefs = prefs(context);
        if (!prefs.getBoolean("enabled", false)) return;
        String code;
        try {
            code = resolver(context).resolve(lon, lat);
        } catch (Exception error) {
            Log.e(TAG, "commune outlines unreadable", error);
            return;
        }
        String current = prefs.getString("commune", null);
        String lang = prefs.getString("lang", "ar");
        Set<String> pinned = prefs.getStringSet("pinned", new HashSet<>());
        if (!apply(TopicPlan.plan(current, code, lang, lang, pinned)) || code == null) return;
        prefs.edit().putString("commune", code).putLong("updatedAt", System.currentTimeMillis()).apply();
    }

    private static boolean apply(List<TopicPlan.Op> ops) {
        FirebaseMessaging messaging = FirebaseMessaging.getInstance();
        try {
            for (TopicPlan.Op op : ops) {
                Tasks.await(op.join ? messaging.subscribeToTopic(op.topic) : messaging.unsubscribeFromTopic(op.topic), 30, TimeUnit.SECONDS);
                Log.i(TAG, op.toString());
            }
            return true;
        } catch (Exception error) {
            Log.e(TAG, "topic change failed; retrying on the next fix", error);
            return false;
        }
    }

    private CommuneTracker() {}
}
