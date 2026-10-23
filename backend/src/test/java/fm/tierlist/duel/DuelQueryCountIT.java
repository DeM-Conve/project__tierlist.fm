package fm.tierlist.duel;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import fm.tierlist.PostgresIT;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// No N+1: a duel request on a 333-song board costs a handful of SQL
// statements, however many songs and duels the board has - the first
// analysis inserts its 300 starting scores in JDBC batches, not row by row.
class DuelQueryCountIT extends PostgresIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    ObjectMapper json;

    @Autowired
    EntityManagerFactory emf;

    private final RequestPostProcessor carol = oidcLogin().idToken(t -> t.subject("carol"));
    private static final String BOARD = "/api/duels/Big Board";
    private Statistics stats;

    // 60 songs in each ranked tier + 33 to-do = 333.
    private static String layout() {
        StringBuilder b = new StringBuilder("{\"tiers\": {");
        String[] tiers = {"S", "A", "B", "C", "D", "TODO"};
        for (int t = 0; t < tiers.length; t++) {
            boolean todo = tiers[t].equals("TODO");
            List<String> ids = new ArrayList<>();
            for (int i = 0; i < (todo ? 33 : 60); i++) {
                ids.add("\"" + String.format("%-3s%08d", todo ? "TD" : tiers[t], i).replace(' ', '_') + "\"");
            }
            b.append(t > 0 ? ", " : "").append('"').append(tiers[t]).append("\": [").append(String.join(", ", ids)).append(']');
        }
        return b.append("}}").toString();
    }

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM app_user");
        stats = emf.unwrap(SessionFactory.class).getStatistics();
        stats.setStatisticsEnabled(true);
    }

    private record Cost(JsonNode body, long statements, long ms) {}

    private Cost measure(MockHttpServletRequestBuilder req, String body, int expectedStatus) throws Exception {
        stats.clear();
        long t = System.nanoTime();
        String out = mvc.perform(req.with(carol).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().is(expectedStatus)).andReturn().getResponse().getContentAsString();
        long ms = (System.nanoTime() - t) / 1_000_000;
        return new Cost(json.readTree(out), stats.getPrepareStatementCount(), ms);
    }

    @Test
    void aBigBoardsDuelRequestsCostAFewStatementsEach() throws Exception {
        String layoutBody = "{\"layout\": " + layout() + "}";
        Cost first = measure(post(BOARD + "/analysis"), layoutBody, 200);
        Cost again = measure(post(BOARD + "/analysis"), layoutBody, 200);
        Cost start = measure(post(BOARD + "/sessions"),
            "{\"layout\": %s, \"focus\": \"SMART_MIX\", \"minutes\": 5}".formatted(layout()), 201);
        String sid = start.body().get("id").asText();
        Cost verdict = null;
        for (int i = 0; i < 20; i++) {
            JsonNode m = (verdict == null ? start : verdict).body().get("matchup");
            verdict = measure(post(BOARD + "/sessions/" + sid + "/verdicts"),
                "{\"layout\": %s, \"a\": \"%s\", \"b\": \"%s\", \"verdict\": \"A\", \"seenDuels\": %d}"
                    .formatted(layout(), m.get("a").asText(), m.get("b").asText(), i), 200);
        }
        Cost end = measure(post(BOARD + "/sessions/" + sid + "/end"), layoutBody, 200);
        System.out.printf("DUEL-SQL first analysis %d stmts %d ms | analysis %d stmts %d ms | start %d stmts %d ms"
                + " | 20th verdict %d stmts %d ms | end %d stmts %d ms%n",
            first.statements(), first.ms(), again.statements(), again.ms(), start.statements(), start.ms(),
            verdict.statements(), verdict.ms(), end.statements(), end.ms());

        // Constant in the board's size: none of these grows with 333 songs.
        assertThat(first.statements()).isLessThan(20);
        assertThat(again.statements()).isLessThan(15);
        assertThat(start.statements()).isLessThan(15);
        assertThat(verdict.statements()).isLessThan(15);
        assertThat(end.statements()).isLessThan(15);
    }
}
