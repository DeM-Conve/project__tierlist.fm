package fm.tierlist.duel;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import fm.tierlist.PostgresIT;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// The duel API over HTTP against real Postgres: sessions, verdicts, undo,
// skips, the time limit, suggestions, decisions and locks - and that one
// user can't touch another's sessions.
class DuelApiIT extends PostgresIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    ObjectMapper json;

    @MockBean
    Clock clock;

    private Instant now = Instant.parse("2026-10-01T12:00:00Z");
    private final RequestPostProcessor alice = oidcLogin().idToken(t -> t.subject("alice"));
    private final RequestPostProcessor bob = oidcLogin().idToken(t -> t.subject("bob"));
    private static final String BOARD = "/api/duels/Rap Board";

    private static String id(String tier, int i) {
        return String.format("%-3s%08d", tier, i).replace(' ', '_');
    }

    private static String layout() {
        StringBuilder b = new StringBuilder("{\"tiers\": {");
        String[] tiers = {"S", "A", "B", "C", "D", "TODO"};
        for (int t = 0; t < tiers.length; t++) {
            List<String> ids = new ArrayList<>();
            for (int i = 0; i < (tiers[t].equals("TODO") ? 2 : 5); i++) ids.add("\"" + id(tiers[t].equals("TODO") ? "TD" : tiers[t], i) + "\"");
            b.append(t > 0 ? ", " : "").append('"').append(tiers[t]).append("\": [").append(String.join(", ", ids)).append(']');
        }
        return b.append("}}").toString();
    }

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM app_user");
        when(clock.instant()).thenAnswer(i -> now);
    }

    private ResultActions call(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req, String body, RequestPostProcessor who) throws Exception {
        return mvc.perform(req.with(who).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private JsonNode ok(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    private JsonNode start(String focus) throws Exception {
        String body = "{\"layout\": %s, \"focus\": \"%s\", \"minutes\": 5}".formatted(layout(), focus);
        return ok(call(post(BOARD + "/sessions"), body, alice).andExpect(status().isCreated()));
    }

    private int seen(String session) {
        return jdbc.queryForObject("SELECT count(*) FROM duel WHERE session_id = ?::uuid", Integer.class, session);
    }

    private JsonNode verdict(String session, String a, String b, String v) throws Exception {
        String body = "{\"layout\": %s, \"a\": \"%s\", \"b\": \"%s\", \"verdict\": \"%s\", \"seenDuels\": %d}".formatted(layout(), a, b, v, seen(session));
        return ok(call(post(BOARD + "/sessions/" + session + "/verdicts"), body, alice).andExpect(status().isOk()));
    }

    private String seenBody(String session) {
        return "{\"layout\": " + layout() + ", \"seenDuels\": " + seen(session) + "}";
    }

    private String layoutBody() {
        return "{\"layout\": " + layout() + "}";
    }

    @Test
    void placeTodoSessionRoundTrip() throws Exception {
        JsonNode s = start("PLACE_TODO");
        String sid = s.get("id").asText();
        assertThat(s.get("matchup").get("a").asText()).isEqualTo(id("TD", 0));
        assertThat(s.get("matchup").get("reason").get("kind").asText()).isEqualTo("PLACE");
        assertThat(s.get("matchup").get("songA").get("probabilities")).hasSize(5);
        assertThat(s.get("done").asBoolean()).isFalse();

        String b = s.get("matchup").get("b").asText();
        JsonNode after = verdict(sid, id("TD", 0), b, "A_CLEARLY");
        assertThat(after.get("duels")).hasSize(1);
        assertThat(after.get("previous").get("a").get("id").asText()).isEqualTo(id("TD", 0));
        assertThat(after.get("matchup")).isNotNull();

        JsonNode undone = ok(call(post(BOARD + "/sessions/" + sid + "/undo"), seenBody(sid), alice).andExpect(status().isOk()));
        assertThat(undone.get("duels")).isEmpty();
        assertThat(undone.get("matchup").get("b").asText()).isEqualTo(b);
        assertThat(ok(call(post(BOARD + "/sessions/" + sid + "/undo"), seenBody(sid), alice)).get("duels")).isEmpty();

        String skipBody = "{\"layout\": %s, \"videoId\": \"%s\", \"seenDuels\": 0}".formatted(layout(), id("TD", 0));
        JsonNode skipped = ok(call(post(BOARD + "/sessions/" + sid + "/skips"), skipBody, alice).andExpect(status().isOk()));
        assertThat(skipped.get("skipped").get(0).asText()).isEqualTo(id("TD", 0));
        assertThat(skipped.get("matchup").get("a").asText()).isEqualTo(id("TD", 1));
        call(post(BOARD + "/sessions/" + sid + "/skips"), skipBody, alice).andExpect(status().isOk());

        JsonNode analysis = ok(call(post(BOARD + "/analysis"), layoutBody(), alice).andExpect(status().isOk()));
        assertThat(analysis.get("activeSession").asText()).isEqualTo(sid);
        assertThat(analysis.get("unplaced").asInt()).isEqualTo(2);
        assertThat(analysis.get("borders")).hasSize(4);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM duel_prior", Integer.class)).isEqualTo(27);

        JsonNode resumed = ok(call(post(BOARD + "/sessions/" + sid), layoutBody(), alice).andExpect(status().isOk()));
        assertThat(resumed.get("id").asText()).isEqualTo(sid);
    }

    @Test
    void aSongMovedToAnotherTierStartsFromThatTier() throws Exception {
        call(post(BOARD + "/analysis"), layoutBody(), alice).andExpect(status().isOk());
        double before = jdbc.queryForObject("SELECT mu FROM duel_prior WHERE video_id = ?", Double.class, id("C", 2));
        // C_2 dragged up to S on the board (staged): the layout says so.
        String moved = layout().replace("\"" + id("C", 2) + "\", ", "").replace("\"S\": [", "\"S\": [\"" + id("C", 2) + "\", ");
        call(post(BOARD + "/analysis"), "{\"layout\": " + moved + "}", alice).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT tier::text FROM duel_prior WHERE video_id = ?", String.class, id("C", 2))).isEqualTo("S");
        assertThat(jdbc.queryForObject("SELECT mu FROM duel_prior WHERE video_id = ?", Double.class, id("C", 2))).isGreaterThan(before + 6);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM duel_prior", Integer.class)).isEqualTo(27);
    }

    @Test
    void endingASessionSummarisesItAndClosesIt() throws Exception {
        JsonNode s = start("SMART_MIX");
        String sid = s.get("id").asText();
        verdict(sid, id("D", 0), id("S", 0), "A_CLEARLY");
        verdict(sid, id("B", 0), id("B", 1), "TOO_CLOSE");
        verdict(sid, id("B", 1), id("B", 0), "TOO_CLOSE");
        verdict(sid, id("B", 0), id("B", 1), "TOO_CLOSE");
        now = now.plusSeconds(90);
        JsonNode summary = ok(call(post(BOARD + "/sessions/" + sid + "/end"), layoutBody(), alice).andExpect(status().isOk()));
        assertThat(summary.get("duels").asInt()).isEqualTo(4);
        assertThat(summary.get("seconds").asLong()).isEqualTo(90);
        assertThat(summary.get("upset").get("winner").asText()).isEqualTo(id("D", 0));
        assertThat(summary.get("undecided")).hasSize(1);
        call(post(BOARD + "/sessions/" + sid + "/verdicts"),
            "{\"layout\": %s, \"a\": \"%s\", \"b\": \"%s\", \"verdict\": \"A\", \"seenDuels\": 4}".formatted(layout(), id("A", 0), id("B", 0)), alice)
            .andExpect(status().isConflict());
    }

    @Test
    void aRepeatedOrStaleWriteIsRefusedNotRecordedTwice() throws Exception {
        String sid = start("SMART_MIX").get("id").asText();
        String body = "{\"layout\": %s, \"a\": \"%s\", \"b\": \"%s\", \"verdict\": \"A\", \"seenDuels\": 0}".formatted(layout(), id("A", 0), id("B", 0));
        call(post(BOARD + "/sessions/" + sid + "/verdicts"), body, alice).andExpect(status().isOk());
        call(post(BOARD + "/sessions/" + sid + "/verdicts"), body, alice)
            .andExpect(status().isConflict())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.stale").value(true));
        assertThat(seen(sid)).isEqualTo(1);
        call(post(BOARD + "/sessions/" + sid + "/undo"), "{\"layout\": " + layout() + ", \"seenDuels\": 0}", alice).andExpect(status().isConflict());
        assertThat(seen(sid)).isEqualTo(1);
    }

    @Test
    void timeIsUpAfterTheSessionLength() throws Exception {
        String sid = start("SMART_MIX").get("id").asText();
        now = now.plus(Duration.ofMinutes(6));
        JsonNode s = ok(call(post(BOARD + "/sessions/" + sid), layoutBody(), alice).andExpect(status().isOk()));
        assertThat(s.get("done").asBoolean()).isTrue();
        assertThat(s.get("matchup").isNull()).isTrue();
        String skipBody = "{\"layout\": %s, \"videoId\": \"%s\", \"seenDuels\": 0}".formatted(layout(), id("TD", 0));
        call(post(BOARD + "/sessions/" + sid + "/skips"), skipBody, alice).andExpect(status().isConflict());
    }

    @Test
    void aNewSessionEndsTheOpenOne() throws Exception {
        String first = start("SMART_MIX").get("id").asText();
        start("BORDERLINES");
        assertThat(jdbc.queryForObject("SELECT ended_at IS NOT NULL FROM duel_session WHERE id = ?::uuid", Boolean.class, first)).isTrue();
    }

    @Test
    void oneSongIsNoLongerAFocus() throws Exception {
        // The One song mode was removed: its focus is refused like any unknown value.
        String body = "{\"layout\": %s, \"focus\": \"ONE_SONG\", \"songId\": \"%s\", \"minutes\": 5}".formatted(layout(), id("C", 2));
        call(post(BOARD + "/sessions"), body, alice).andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM duel_session", Integer.class)).isZero();
    }

    @Test
    void suggestionsDecisionsAndLocks() throws Exception {
        String sid = start("SMART_MIX").get("id").asText();
        String song = id("A", 2);
        for (int i = 0; i < 5; i++) verdict(sid, song, id("S", i), "A_CLEARLY");
        JsonNode a = ok(call(post(BOARD + "/analysis"), layoutBody(), alice));
        assertThat(a.get("suggestions").toString()).contains(song);
        assertThat(a.get("tierOrders").has("A")).isTrue();

        call(put(BOARD + "/locks/" + song), "", alice).andExpect(status().isNoContent());
        call(put(BOARD + "/locks/" + song), "", alice).andExpect(status().isNoContent());
        assertThat(ok(call(post(BOARD + "/analysis"), layoutBody(), alice)).get("suggestions").toString()).doesNotContain(song);
        call(delete(BOARD + "/locks/" + song), "", alice).andExpect(status().isNoContent());

        String keep = "{\"from\": \"A\", \"to\": \"S\", \"confidence\": 0.9, \"decision\": \"KEPT\"}";
        call(put(BOARD + "/decisions/" + song), keep, alice).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("SELECT duels_at_decision FROM duel_decision", Integer.class)).isEqualTo(5);
        assertThat(ok(call(post(BOARD + "/analysis"), layoutBody(), alice)).get("suggestions").toString()).doesNotContain(song);
        call(delete(BOARD + "/decisions/" + song), "", alice).andExpect(status().isNoContent());
        assertThat(ok(call(post(BOARD + "/analysis"), layoutBody(), alice)).get("suggestions").toString()).contains(song);

        call(put(BOARD + "/decisions/" + song), "{\"from\": \"A\", \"to\": \"TODO\", \"confidence\": 0.9, \"decision\": \"KEPT\"}", alice)
            .andExpect(status().isBadRequest());
    }

    @Test
    void aMoveShortOfTheBarComesBackAsLeaningWithWhatItLacks() throws Exception {
        String sid = start("SMART_MIX").get("id").asText();
        String song = id("A", 2);
        for (int i = 0; i < 3; i++) verdict(sid, song, id("S", i), "A_CLEARLY");
        JsonNode a = ok(call(post(BOARD + "/analysis"), layoutBody(), alice));
        assertThat(a.get("suggestions").toString()).doesNotContain(song);
        JsonNode lean = a.get("leaning").get(0);
        assertThat(lean.get("song").asText()).isEqualTo(song);
        assertThat(lean.get("to").asText()).isEqualTo("S");
        assertThat(lean.get("unmet").toString()).contains("\"kind\":\"DUELS\"", "\"have\":3.0", "\"need\":4.0");

        call(put(BOARD + "/locks/" + song), "", alice).andExpect(status().isNoContent());
        assertThat(ok(call(post(BOARD + "/analysis"), layoutBody(), alice)).get("leaning").toString()).doesNotContain(song);
    }

    @Test
    void renamingABoardTakesItsDuelHistoryAlong() throws Exception {
        String sid = start("SMART_MIX").get("id").asText();
        verdict(sid, id("A", 0), id("B", 0), "A");
        call(put(BOARD + "/locks/" + id("A", 0)), "", alice).andExpect(status().isNoContent());
        call(put(BOARD + "/decisions/" + id("B", 0)), "{\"from\": \"B\", \"to\": \"A\", \"confidence\": 0.9, \"decision\": \"KEPT\"}", alice)
            .andExpect(status().isNoContent());
        call(post(BOARD + "/rename"), "{\"to\": \"Hip Hop\"}", alice).andExpect(status().isNoContent());
        assertThat(jdbc.queryForList("SELECT DISTINCT board FROM duel_session", String.class)).containsExactly("Hip Hop");
        assertThat(jdbc.queryForList("SELECT DISTINCT board FROM duel_prior", String.class)).containsExactly("Hip Hop");
        assertThat(jdbc.queryForObject("SELECT board FROM duel_lock", String.class)).isEqualTo("Hip Hop");
        assertThat(jdbc.queryForObject("SELECT board FROM duel_decision", String.class)).isEqualTo("Hip Hop");
        JsonNode moved = ok(call(post("/api/duels/Hip Hop/sessions/" + sid), layoutBody(), alice).andExpect(status().isOk()));
        assertThat(moved.get("duels")).hasSize(1);
        call(post("/api/duels/Hip Hop/rename"), "{\"to\": \"Hip Hop\"}", alice).andExpect(status().isNoContent());
        call(post("/api/duels/Hip Hop/rename"), "{\"to\": \"  \"}", alice).andExpect(status().isBadRequest());
    }

    @Test
    void renamingOntoABoardWithHistoryMerges() throws Exception {
        call(post(BOARD + "/analysis"), layoutBody(), alice).andExpect(status().isOk());
        call(post("/api/duels/Other/analysis"), layoutBody(), alice).andExpect(status().isOk());
        call(put(BOARD + "/locks/" + id("A", 0)), "", alice).andExpect(status().isNoContent());
        call(put("/api/duels/Other/locks/" + id("A", 0)), "", alice).andExpect(status().isNoContent());
        call(put(BOARD + "/decisions/" + id("B", 0)), "{\"from\": \"B\", \"to\": \"A\", \"confidence\": 0.9, \"decision\": \"KEPT\"}", alice);
        call(put("/api/duels/Other/decisions/" + id("B", 0)), "{\"from\": \"B\", \"to\": \"S\", \"confidence\": 0.9, \"decision\": \"ACCEPTED\"}", alice);
        call(post(BOARD + "/rename"), "{\"to\": \"Other\"}", alice).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM duel_prior WHERE board = 'Other'", Integer.class)).isEqualTo(27);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM duel_prior WHERE board <> 'Other'", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM duel_lock", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT decision::text FROM duel_decision", String.class)).isEqualTo("ACCEPTED");
    }

    @Test
    void boardNamesAreChecked() throws Exception {
        call(post("/api/duels/" + "x".repeat(201) + "/analysis"), layoutBody(), alice).andExpect(status().isBadRequest());
        call(post("/api/duels/%20/analysis"), layoutBody(), alice).andExpect(status().isBadRequest());
    }

    @Test
    void sessionsBelongToTheirUserAndBoard() throws Exception {
        String sid = start("SMART_MIX").get("id").asText();
        call(post(BOARD + "/sessions/" + sid), layoutBody(), bob).andExpect(status().isNotFound());
        call(post("/api/duels/Other/sessions/" + sid), layoutBody(), alice).andExpect(status().isNotFound());
    }

    @Test
    void rejectsWhatTheFrontendNeverSends() throws Exception {
        call(post(BOARD + "/analysis"), "{\"layout\": {\"tiers\": {\"S\": [\"bad id\"]}}}", alice).andExpect(status().isBadRequest());
        String sid = start("SMART_MIX").get("id").asText();
        String same = "{\"layout\": %s, \"a\": \"%s\", \"b\": \"%s\", \"verdict\": \"A\", \"seenDuels\": 0}".formatted(layout(), id("A", 0), id("A", 0));
        call(post(BOARD + "/sessions/" + sid + "/verdicts"), same, alice).andExpect(status().isBadRequest());
        String offBoard = "{\"layout\": %s, \"a\": \"%s\", \"b\": \"zzzzzzzzzzz\", \"verdict\": \"A\", \"seenDuels\": 0}".formatted(layout(), id("A", 0));
        call(post(BOARD + "/sessions/" + sid + "/verdicts"), offBoard, alice).andExpect(status().isBadRequest());
        call(post(BOARD + "/sessions"), "{\"layout\": %s, \"focus\": \"SMART_MIX\", \"minutes\": 99}".formatted(layout()), alice)
            .andExpect(status().isBadRequest());
    }

    @Test
    void theDatabaseRefusesNonsense() {
        jdbc.update("INSERT INTO app_user (id) VALUES ('carol')");
        jdbc.update("INSERT INTO duel_session (id, user_id, board, focus, minutes, started_at, certainty_start) "
            + "VALUES ('00000000-0000-0000-0000-0000000000aa', 'carol', 'B', 'SMART_MIX', 5, now(), 0.5)");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update(
            "INSERT INTO duel (session_id, video_a, video_b, verdict, created_at) VALUES ('00000000-0000-0000-0000-0000000000aa', 'aaaaaaaaaaa', 'aaaaaaaaaaa', 'A', now())"))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
}
