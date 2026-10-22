package fm.tierlist.duel;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import fm.tierlist.PostgresIT;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Settings -> Duels -> Tier borders end to end against real Postgres: the
// settings round trip (V3's typed columns, ETag flow), the CHECKs, and a duel
// analysis that follows the user's own ranges instead of learned borders.
class DuelTierRangesIT extends PostgresIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    ObjectMapper json;

    private final RequestPostProcessor alice = oidcLogin().idToken(t -> t.subject("alice"));
    private final RequestPostProcessor bob = oidcLogin().idToken(t -> t.subject("bob"));

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM app_user");
    }

    private static String settings(String duels) {
        String labels = "{\"S\": \"S\", \"A\": \"A\", \"B\": \"B\", \"C\": \"C\", \"D\": \"D\", \"TODO\": \"TODO\"}";
        return """
            {"appearance": {"theme": "tokyo", "accent": "blue", "tierPalette": "vivid"},
             "naming": {"template": "{category} {tier}", "tierLabels": %s, "todoLinks": {}}%s}"""
            .formatted(labels, duels == null ? "" : ", \"duels\": " + duels);
    }

    private static final String MINE = "{\"tierBorders\": \"custom\", \"tierMinimums\": {\"S\": 900, \"A\": 280, \"B\": 220, \"C\": 160}}";

    private JsonNode save(RequestPostProcessor who, String body, String header, String value, int status) throws Exception {
        String out = mvc.perform(put("/api/settings").with(who).contentType(MediaType.APPLICATION_JSON).content(body).header(header, value))
            .andExpect(status().is(status)).andReturn().getResponse().getContentAsString();
        return out.isEmpty() ? null : json.readTree(out);
    }

    private static String id(String tier, int i) {
        return String.format("%-3s%08d", tier, i).replace(' ', '_');
    }

    private static String layout() {
        StringBuilder b = new StringBuilder("{\"layout\": {\"tiers\": {");
        String[] tiers = {"S", "A", "B", "C", "D"};
        for (int t = 0; t < tiers.length; t++) {
            List<String> ids = new ArrayList<>();
            for (int i = 0; i < 5; i++) ids.add("\"" + id(tiers[t], i) + "\"");
            b.append(t > 0 ? ", " : "").append('"').append(tiers[t]).append("\": [").append(String.join(", ", ids)).append(']');
        }
        return b.append("}}}").toString();
    }

    private JsonNode analysis(RequestPostProcessor who) throws Exception {
        return json.readTree(mvc.perform(post("/api/duels/Rap/analysis").with(who).contentType(MediaType.APPLICATION_JSON).content(layout()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    @Test
    void customRangesRoundTripAndTheAnalysisFollowsThem() throws Exception {
        JsonNode learned = analysis(alice);
        assertThat(learned.get("customBorders").asBoolean()).isFalse();
        assertThat(learned.get("borders").get(0).get("score").asDouble()).isBetween(30.0, 38.0);

        JsonNode saved = save(alice, settings(MINE), HttpHeaders.IF_NONE_MATCH, "*", 200);
        assertThat(saved.at("/duels/tierBorders").asText()).isEqualTo("custom");
        assertThat(saved.at("/duels/tierMinimums/S").asInt()).isEqualTo(900);
        assertThat(jdbc.queryForObject("SELECT duel_tier_borders::text FROM user_settings WHERE user_id = 'alice'", String.class)).isEqualTo("CUSTOM");
        assertThat(jdbc.queryForObject("SELECT duel_tier_c_min FROM user_settings WHERE user_id = 'alice'", Integer.class)).isEqualTo(160);

        JsonNode read = json.readTree(mvc.perform(get("/api/settings").with(alice)).andReturn().getResponse().getContentAsString());
        assertThat(read.get("duels")).isEqualTo(saved.get("duels"));

        JsonNode mine = analysis(alice);
        assertThat(mine.get("customBorders").asBoolean()).isTrue();
        double[] expected = {89.95, 27.95, 21.95, 15.95};
        for (int k = 0; k < 4; k++) assertThat(mine.get("borders").get(k).get("score").asDouble()).isCloseTo(expected[k], within(1e-9));
        // S starts at 900 shown: nobody on the board is likely S any more.
        for (JsonNode song : mine.get("songs")) assertThat(song.get("probabilities").get("S").asDouble()).isLessThan(0.01);
        assertThat(mine.get("certainty").asDouble()).isLessThan(learned.get("certainty").asDouble());
        // A session's certainty uses the same borders.
        String start = layout().replaceFirst("\\}$", ", \"focus\": \"SMART_MIX\", \"minutes\": 5}");
        JsonNode session = json.readTree(mvc.perform(post("/api/duels/Rap/sessions").with(alice).contentType(MediaType.APPLICATION_JSON).content(start))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertThat(session.get("certaintyStart").asDouble()).isCloseTo(mine.get("certainty").asDouble(), within(1e-6));

        // Another account is untouched.
        assertThat(analysis(bob).get("customBorders").asBoolean()).isFalse();

        // Back to learned: the ranges are kept for next time; an older tab with no duels group keeps both.
        String back = "{\"tierBorders\": \"learned\", \"tierMinimums\": {\"S\": 900, \"A\": 280, \"B\": 220, \"C\": 160}}";
        JsonNode learnedAgain = save(alice, settings(back), HttpHeaders.IF_MATCH, "\"0\"", 200);
        assertThat(learnedAgain.at("/duels/tierMinimums/S").asInt()).isEqualTo(900);
        assertThat(analysis(alice).get("customBorders").asBoolean()).isFalse();
        JsonNode older = save(alice, settings(null), HttpHeaders.IF_MATCH, "\"1\"", 200);
        assertThat(older.at("/duels/tierBorders").asText()).isEqualTo("learned");
        assertThat(older.at("/duels/tierMinimums/A").asInt()).isEqualTo(280);
    }

    @Test
    void badRangesAre400AndNeverStored() throws Exception {
        save(alice, settings("{\"tierBorders\": \"custom\"}"), HttpHeaders.IF_NONE_MATCH, "*", 400);
        save(alice, settings("{\"tierBorders\": \"custom\", \"tierMinimums\": {\"S\": 200, \"A\": 280, \"B\": 220, \"C\": 160}}"),
            HttpHeaders.IF_NONE_MATCH, "*", 400);
        save(alice, settings("{\"tierBorders\": \"custom\", \"tierMinimums\": {\"S\": 340, \"A\": 280, \"B\": 220, \"C\": -1}}"),
            HttpHeaders.IF_NONE_MATCH, "*", 400);
        save(alice, settings("{\"tierBorders\": \"mine\"}"), HttpHeaders.IF_NONE_MATCH, "*", 400);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_settings", Integer.class)).isZero();
    }

    @Test
    void theDatabaseRefusesWhatTheApiWould() throws Exception {
        save(alice, settings(null), HttpHeaders.IF_NONE_MATCH, "*", 200);
        assertThat(jdbc.queryForObject("SELECT duel_tier_borders::text FROM user_settings WHERE user_id = 'alice'", String.class)).isEqualTo("LEARNED");
        String update = "UPDATE user_settings SET duel_tier_borders = ?::duel_tier_borders, duel_tier_s_min = ?, duel_tier_a_min = ?, "
            + "duel_tier_b_min = ?, duel_tier_c_min = ? WHERE user_id = 'alice'";
        assertThatThrownBy(() -> jdbc.update(update, "CUSTOM", null, null, null, null)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(update, "LEARNED", 300, null, null, null)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(update, "CUSTOM", 300, 300, 200, 100)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(update, "CUSTOM", 1001, 300, 200, 100)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(update, "CUSTOM", 400, 300, 200, -1)).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(jdbc.update(update, "CUSTOM", 400, 300, 200, 100)).isEqualTo(1);
    }
}
