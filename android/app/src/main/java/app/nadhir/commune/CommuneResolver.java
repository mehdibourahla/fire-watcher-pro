package app.nadhir.commune;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class CommuneResolver {

    private final String[] codes;
    private final double[][] boxes;
    private final double[][][][] polygons;

    private CommuneResolver(String[] codes, double[][] boxes, double[][][][] polygons) {
        this.codes = codes;
        this.boxes = boxes;
        this.polygons = polygons;
    }

    public static CommuneResolver fromJson(String json) throws JSONException {
        JSONArray communes = new JSONObject(json).getJSONArray("communes");
        int n = communes.length();
        String[] codes = new String[n];
        double[][] boxes = new double[n][];
        double[][][][] polygons = new double[n][][][];
        for (int i = 0; i < n; i++) {
            JSONObject commune = communes.getJSONObject(i);
            codes[i] = commune.getString("c");
            JSONArray b = commune.getJSONArray("b");
            boxes[i] = new double[] { b.getDouble(0), b.getDouble(1), b.getDouble(2), b.getDouble(3) };
            JSONArray p = commune.getJSONArray("p");
            polygons[i] = new double[p.length()][][];
            for (int j = 0; j < p.length(); j++) {
                JSONArray rings = p.getJSONArray(j);
                polygons[i][j] = new double[rings.length()][];
                for (int k = 0; k < rings.length(); k++) {
                    JSONArray ring = rings.getJSONArray(k);
                    double[] flat = new double[ring.length() * 2];
                    for (int m = 0; m < ring.length(); m++) {
                        JSONArray point = ring.getJSONArray(m);
                        flat[2 * m] = point.getDouble(0);
                        flat[2 * m + 1] = point.getDouble(1);
                    }
                    polygons[i][j][k] = flat;
                }
            }
        }
        return new CommuneResolver(codes, boxes, polygons);
    }

    private static boolean inRing(double[] ring, double lon, double lat) {
        boolean inside = false;
        int count = ring.length / 2;
        for (int i = 0, j = count - 1; i < count; j = i++) {
            double xi = ring[2 * i], yi = ring[2 * i + 1];
            double xj = ring[2 * j], yj = ring[2 * j + 1];
            if ((yi > lat) != (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    }

    public String resolve(double lon, double lat) {
        for (int i = 0; i < codes.length; i++) {
            double[] b = boxes[i];
            if (lon < b[0] || lat < b[1] || lon > b[2] || lat > b[3]) continue;
            for (double[][] rings : polygons[i]) {
                boolean inside = false;
                for (double[] ring : rings) if (inRing(ring, lon, lat)) inside = !inside;
                if (inside) return codes[i];
            }
        }
        return null;
    }
}
