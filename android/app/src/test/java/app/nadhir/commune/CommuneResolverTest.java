package app.nadhir.commune;

import static org.junit.Assert.assertEquals;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class CommuneResolverTest {

    private static String read(String path) throws Exception {
        return new String(Files.readAllBytes(Paths.get(path)), StandardCharsets.UTF_8);
    }

    @Test
    public void agreesWithTheSharedFixture() throws Exception {
        CommuneResolver resolver = CommuneResolver.fromJson(read("../../public/geo/communes.v1.json"));
        JSONArray fixture = new JSONArray(read("../../data/geo/commune-fixture.json"));
        for (int i = 0; i < fixture.length(); i++) {
            JSONObject point = fixture.getJSONObject(i);
            String expected = point.isNull("code") ? null : point.getString("code");
            assertEquals(expected, resolver.resolve(point.getDouble("lon"), point.getDouble("lat")));
        }
    }

    @Test
    public void swapsTheFollowedTopicWhenTheCommuneChanges() {
        List<TopicPlan.Op> ops = TopicPlan.plan("1501", "1502", "ar", "ar", Collections.emptySet());
        assertEquals(
            Arrays.asList(new TopicPlan.Op(false, "v1.commune.1501.ar"), new TopicPlan.Op(true, "v1.commune.1502.ar")),
            ops
        );
    }

    @Test
    public void neverLeavesAManualSubscription() {
        List<TopicPlan.Op> ops = TopicPlan.plan("1501", "1502", "ar", "ar", new HashSet<>(Arrays.asList("1501", "1502")));
        assertEquals(Collections.emptyList(), ops);
    }

    @Test
    public void keepsTheCommuneWhenThePositionMatchesNone() {
        assertEquals(Collections.emptyList(), TopicPlan.plan("1501", null, "ar", "ar", Collections.emptySet()));
    }

    @Test
    public void movesToTheNewLanguageTopic() {
        List<TopicPlan.Op> ops = TopicPlan.plan("1501", "1501", "ar", "fr", Collections.emptySet());
        assertEquals(
            Arrays.asList(new TopicPlan.Op(false, "v1.commune.1501.ar"), new TopicPlan.Op(true, "v1.commune.1501.fr")),
            ops
        );
    }

    @Test
    public void joinsTheFirstCommuneFound() {
        assertEquals(
            Collections.singletonList(new TopicPlan.Op(true, "v1.commune.1501.ar")),
            TopicPlan.plan(null, "1501", "ar", "ar", Collections.emptySet())
        );
    }

    private static Set<String> set(String... codes) {
        return new HashSet<>(Arrays.asList(codes));
    }

    @Test
    public void takesOverTheCommuneWhenItStopsBeingManual() {
        assertEquals(
            Collections.singletonList(new TopicPlan.Op(true, "v1.commune.1501.ar")),
            TopicPlan.repin("1501", "ar", "ar", set("1501"), set())
        );
    }

    @Test
    public void neverDropsATopicTheManualSubscriptionJustJoined() {
        assertEquals(Collections.emptyList(), TopicPlan.repin("1501", "ar", "ar", set(), set("1501")));
    }

    @Test
    public void dropsItsOwnOtherLanguageTopicWhenTheCommuneBecomesManual() {
        assertEquals(
            Collections.singletonList(new TopicPlan.Op(false, "v1.commune.1501.ar")),
            TopicPlan.repin("1501", "ar", "fr", set(), set("1501"))
        );
    }

    @Test
    public void followsALanguageChangeForItsOwnCommune() {
        assertEquals(
            Arrays.asList(new TopicPlan.Op(false, "v1.commune.1501.ar"), new TopicPlan.Op(true, "v1.commune.1501.fr")),
            TopicPlan.repin("1501", "ar", "fr", set(), set())
        );
    }

    @Test
    public void doesNothingWithoutACurrentCommune() {
        assertEquals(Collections.emptyList(), TopicPlan.repin(null, "ar", "fr", set("1501"), set()));
    }
}
