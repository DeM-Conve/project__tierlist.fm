package fm.tierlist.settings;

import fm.tierlist.PostgresIT;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultMatcher;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// GET/PUT /api/settings over HTTP against real Postgres: conditional writes,
// the 400s for anything the frontend would never send, and per-account rows.
// (SettingsControllerIT covers the main round trips.)
class SettingsApiIT extends PostgresIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate jdbc;

    private final RequestPostProcessor alice = oidcLogin().idToken(t -> t.subject("alice"));
    private final RequestPostProcessor bob = oidcLogin().idToken(t -> t.subject("bob"));

    private static final String LABELS = "{\"S\": \"S\", \"A\": \"A\", \"B\": \"B\", \"C\": \"C\", \"D\": \"D\", \"TODO\": \"TODO\"}";

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM app_user");
    }

    private static String body(String theme, String accent, String palette, String tierLabels,
                               String migratingFrom, String migratingFromTierLabels, String links) {
        return """
            {"appearance": {"theme": %s, "accent": %s, "tierPalette": %s},
             "naming": {"template": "{category} {tier}", "tierLabels": %s, "migratingFrom": %s,
                        "migratingFromTierLabels": %s, "todoLinks": %s}}""".formatted(theme, accent, palette, tierLabels, migratingFrom,
            migratingFromTierLabels, links);
    }

    private static String body(String links) {
        return body("\"tokyo\"", "\"blue\"", "\"vivid\"", LABELS, "null", "null", links);
    }

    // A body whose appearance group carries `"activityOrder": <order>` (raw JSON).
    private static String withOrder(String order) {
        return body("{}").replace("\"tierPalette\": \"vivid\"}", "\"tierPalette\": \"vivid\", \"activityOrder\": " + order + "}");
    }

    private MockHttpServletRequestBuilder save(RequestPostProcessor who, String json) {
        return put("/api/settings").with(who).contentType(MediaType.APPLICATION_JSON).content(json);
    }

    private static ResultMatcher problemJson() {
        return r -> assertThat(r.getResponse().getContentType()).isEqualTo(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
    }

    private long storedVersion(String user) {
        return jdbc.queryForObject("SELECT version FROM user_settings WHERE user_id = ?", Long.class, user);
    }

    // ---- conditional writes -------------------------------------------------

    @Test
    void theETagIsTheQuotedRowVersionOnPutAndGet() throws Exception {
        mvc.perform(save(alice, body("{}")).header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.ETAG, "\"0\""));
        mvc.perform(save(alice, body("{\"PL1\": \"Rap\"}")).header(HttpHeaders.IF_MATCH, "\"0\""))
            .andExpect(header().string(HttpHeaders.ETAG, "\"" + storedVersion("alice") + "\""));
        mvc.perform(get("/api/settings").with(alice))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.ETAG, "\"1\""));
    }

    @Test
    void aWriteWithoutAPreconditionIs428ProblemDetail() throws Exception {
        mvc.perform(save(alice, body("{}")))
            .andExpect(status().isPreconditionRequired())
            .andExpect(problemJson())
            .andExpect(jsonPath("$.status").value(428));
        mvc.perform(save(alice, body("{}")).header(HttpHeaders.IF_NONE_MATCH, "\"0\""))
            .andExpect(status().isPreconditionRequired());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_settings", Integer.class)).isZero();
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {"W/\"0\"", "*", "\"zero\"", "\"0\", \"1\""})
    void anIfMatchThatIsNotOneOfOurETagsIs412(String ifMatch) throws Exception {
        mvc.perform(save(alice, body("{}")).header(HttpHeaders.IF_NONE_MATCH, "*")).andExpect(status().isOk());

        mvc.perform(save(alice, body("{\"PL1\": \"Rap\"}")).header(HttpHeaders.IF_MATCH, ifMatch))
            .andExpect(status().isPreconditionFailed())
            .andExpect(problemJson());
        assertThat(storedVersion("alice")).isZero();
    }

    @Test
    void aStaleWriteIs412AndChangesNothing() throws Exception {
        mvc.perform(save(alice, body("{}")).header(HttpHeaders.IF_NONE_MATCH, "*")).andExpect(status().isOk());
        mvc.perform(save(alice, body("{\"PL1\": \"Rap\"}")).header(HttpHeaders.IF_MATCH, "\"0\"")).andExpect(status().isOk());

        mvc.perform(save(alice, body("\"sand\"", "\"blue\"", "\"vivid\"", LABELS, "null", "null", "{}"))
                .header(HttpHeaders.IF_MATCH, "\"0\""))
            .andExpect(status().isPreconditionFailed())
            .andExpect(jsonPath("$.title").value("Settings changed elsewhere"));

        mvc.perform(get("/api/settings").with(alice))
            .andExpect(jsonPath("$.appearance.theme").value("tokyo"))
            .andExpect(jsonPath("$.naming.todoLinks.PL1").value("Rap"));
    }

    @Test
    void savingTheSameSettingsAgainKeepsTheVersion() throws Exception {
        mvc.perform(save(alice, body("{\"PL1\": \"Rap\"}")).header(HttpHeaders.IF_NONE_MATCH, "*")).andExpect(status().isOk());

        mvc.perform(save(alice, body("{\"PL1\": \"Rap\"}")).header(HttpHeaders.IF_MATCH, "\"0\""))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.ETAG, "\"0\""));
        assertThat(storedVersion("alice")).isZero();
    }

    @Test
    void changingSettingsAndLinksTogetherReturnsTheStoredVersion() throws Exception {
        mvc.perform(save(alice, body("{}")).header(HttpHeaders.IF_NONE_MATCH, "*")).andExpect(status().isOk());

        String etag = mvc.perform(save(alice, body("\"paper\"", "\"red\"", "\"heat\"", LABELS, "null", "null",
                    "{\"PL1\": \"Rap\"}")).header(HttpHeaders.IF_MATCH, "\"0\""))
            .andExpect(status().isOk())
            .andReturn().getResponse().getHeader(HttpHeaders.ETAG);

        assertThat(etag).isEqualTo("\"" + storedVersion("alice") + "\"").isNotEqualTo("\"0\"");
        // ...and it's immediately usable for the next write.
        mvc.perform(save(alice, body("{}")).header(HttpHeaders.IF_MATCH, etag)).andExpect(status().isOk());
    }

    // ---- activity bar order -------------------------------------------------

    @Test
    void aCustomActivityOrderRoundTripsAndChangingOnlyItIsANewETag() throws Exception {
        String mine = "[\"addSongs\", \"boards\", \"home\", \"playlists\", \"jump\"]";
        mvc.perform(save(alice, withOrder(mine)).header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.ETAG, "\"0\""))
            .andExpect(jsonPath("$.appearance.activityOrder[0]").value("addSongs"));
        assertThat(jdbc.queryForList("SELECT item::text FROM activity_bar_item WHERE user_id = 'alice' ORDER BY position",
            String.class)).containsExactly("ADD_SONGS", "BOARDS", "HOME", "PLAYLISTS", "JUMP", "DUELS");

        // Swap the top two only (rows rewritten in place - the deferred UNIQUE lets it through).
        String swapped = "[\"boards\", \"addSongs\", \"home\", \"playlists\", \"jump\"]";
        String etag = mvc.perform(save(alice, withOrder(swapped)).header(HttpHeaders.IF_MATCH, "\"0\""))
            .andExpect(status().isOk())
            .andReturn().getResponse().getHeader(HttpHeaders.ETAG);
        assertThat(etag).isEqualTo("\"" + storedVersion("alice") + "\"").isNotEqualTo("\"0\"");

        mvc.perform(get("/api/settings").with(alice))
            .andExpect(header().string(HttpHeaders.ETAG, etag))
            .andExpect(jsonPath("$.appearance.activityOrder.length()").value(6))
            .andExpect(jsonPath("$.appearance.activityOrder[0]").value("boards"))
            .andExpect(jsonPath("$.appearance.activityOrder[1]").value("addSongs"))
            .andExpect(jsonPath("$.appearance.activityOrder[4]").value("jump"));

        // The same order again is not a change.
        mvc.perform(save(alice, withOrder(swapped)).header(HttpHeaders.IF_MATCH, etag))
            .andExpect(header().string(HttpHeaders.ETAG, etag));
        // A stale order write is a 412 like any other.
        mvc.perform(save(alice, withOrder(mine)).header(HttpHeaders.IF_MATCH, "\"0\""))
            .andExpect(status().isPreconditionFailed());
    }

    @Test
    void noActivityOrderMeansTheDefaultAndAPartialOneIsCompleted() throws Exception {
        mvc.perform(save(alice, body("{}")).header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(jsonPath("$.appearance.activityOrder[0]").value("home"))
            .andExpect(jsonPath("$.appearance.activityOrder[4]").value("addSongs"));
        mvc.perform(save(alice, withOrder("null")).header(HttpHeaders.IF_MATCH, "\"0\""))
            .andExpect(header().string(HttpHeaders.ETAG, "\"0\"")); // still the default: no change

        mvc.perform(save(alice, withOrder("[\"playlists\"]")).header(HttpHeaders.IF_MATCH, "\"0\""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.appearance.activityOrder[0]").value("playlists"))
            .andExpect(jsonPath("$.appearance.activityOrder[1]").value("home"))
            .andExpect(jsonPath("$.appearance.activityOrder[4]").value("addSongs"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM activity_bar_item", Integer.class)).isEqualTo(6);
    }

    @Test
    void aBadActivityOrderIs400() throws Exception {
        for (String bad : new String[] {
            "[\"home\", \"home\"]",          // duplicate
            "[\"home\", \"settings\"]",      // not a reorderable item
            "[\"HOME\"]",                    // DB label, not the key
            "[\"home\", null]",
            "\"home\"",                      // not a list
        }) {
            mvc.perform(save(alice, withOrder(bad)).header(HttpHeaders.IF_NONE_MATCH, "*"))
                .andExpect(status().isBadRequest())
                .andExpect(problemJson());
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_settings", Integer.class)).isZero();
    }

    // ---- per account --------------------------------------------------------

    @Test
    void theFirstSaveRecordsTheUserAndEachAccountHasItsOwnRow() throws Exception {
        mvc.perform(save(alice, body("{\"PL1\": \"Rap\"}")).header(HttpHeaders.IF_NONE_MATCH, "*")).andExpect(status().isOk());
        assertThat(jdbc.queryForList("SELECT id FROM app_user", String.class)).containsExactly("alice");

        mvc.perform(get("/api/settings").with(bob)).andExpect(status().isNoContent());
        mvc.perform(save(bob, body("{}")).header(HttpHeaders.IF_MATCH, "\"0\"")).andExpect(status().isPreconditionFailed());
        mvc.perform(save(bob, body("\"dracula\"", "\"blue\"", "\"vivid\"", LABELS, "null", "null", "{\"PL1\": \"Jazz\"}"))
                .header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isOk());

        mvc.perform(get("/api/settings").with(alice))
            .andExpect(jsonPath("$.appearance.theme").value("tokyo"))
            .andExpect(jsonPath("$.naming.todoLinks.PL1").value("Rap"));
        mvc.perform(get("/api/settings").with(bob))
            .andExpect(jsonPath("$.appearance.theme").value("dracula"))
            .andExpect(jsonPath("$.naming.todoLinks.PL1").value("Jazz"));
    }

    @Test
    void settingsNeedLoginToWriteToo() throws Exception {
        mvc.perform(put("/api/settings").contentType(MediaType.APPLICATION_JSON).content(body("{}"))
                .header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isUnauthorized());
    }

    // ---- 400s ---------------------------------------------------------------

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "\"neon\"|\"blue\"|\"vivid\"",          // theme
        "\"tokyo\"|\"cyan\"|\"vivid\"",         // accent
        "\"tokyo\"|\"blue\"|\"pastel\"",        // palette
        "\"TOKYO\"|\"blue\"|\"vivid\"",         // DB label, not the key
        "\"tokyo\"|\"blue\"|\"VIVID\"",
        "\"Tokyo\"|\"blue\"|\"vivid\"",
        "null|\"blue\"|\"vivid\"",
        "\"tokyo\"|\"blue\"|null",
    })
    void anOptionTheFrontendDoesNotKnowIs400(String theme, String accent, String palette) throws Exception {
        mvc.perform(save(alice, body(theme, accent, palette, LABELS, "null", "null", "{}"))
                .header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isBadRequest())
            .andExpect(problemJson());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_settings", Integer.class)).isZero();
    }

    // Only the frontend keys: never an enum's ordinal (see FrontendKeys).
    @Test
    void anOptionSentAsANumberIs400() throws Exception {
        mvc.perform(save(alice, body("0", "\"blue\"", "\"2\"", LABELS, "null", "null", "{}"))
                .header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void malformedOrIncompleteBodiesAre400() throws Exception {
        for (String bad : new String[] {
            "{not json",
            "",
            "[]",
            "{\"appearance\": {\"theme\": \"tokyo\", \"accent\": \"blue\", \"tierPalette\": \"vivid\"}}",
            body("\"tokyo\"", "\"blue\"", "\"vivid\"", LABELS, "null", "null", "null"),   // no todoLinks
            body("\"tokyo\"", "\"blue\"", "\"vivid\"", "null", "null", "null", "{}"),     // no tier names
        }) {
            mvc.perform(save(alice, bad).header(HttpHeaders.IF_NONE_MATCH, "*")).andExpect(status().isBadRequest());
        }
        mvc.perform(get("/api/settings").with(alice)).andExpect(status().isNoContent());
    }

    @Test
    void aValidationFailureSaysWhichFieldIsWrong() throws Exception {
        mvc.perform(save(alice, body("\"tokyo\"", "\"blue\"", "\"vivid\"",
                    "{\"S\": \"S\", \"A\": \"S\", \"B\": \"B\", \"C\": \"C\", \"D\": \"D\", \"TODO\": \"TODO\"}", "null", "null", "{}"))
                .header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isBadRequest())
            .andExpect(problemJson())
            .andExpect(jsonPath("$.status").value(400));
    }

    // Half a migration (the current template, no tier names) is a 400, not a 500.
    @Test
    void halfAMigrationFromTheCurrentTemplateIs400() throws Exception {
        mvc.perform(save(alice, body("\"tokyo\"", "\"blue\"", "\"vivid\"", LABELS, "\"{category} {tier}\"", "null", "{}"))
                .header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isBadRequest());
    }

    // The validator and the database's CHECKs agree: a name Postgres would
    // refuse is a 400 up front, never a 412 the frontend retries forever.
    @Test
    void aTierNameTheDatabaseWouldRefuseIs400Not412() throws Exception {
        for (String labels : new String[] {
            "{\"S\": \"S\", \"A\": \"A\", \"B\": \"B\", \"C\": \"C\", \"D\": \"D\", \"TODO\": \"①\"}",
            "{\"S\": \"S\", \"A\": \"S²\", \"B\": \"B\", \"C\": \"C\", \"D\": \"D\", \"TODO\": \"TODO\"}",
        }) {
            mvc.perform(save(alice, body("\"tokyo\"", "\"blue\"", "\"vivid\"", labels, "null", "null", "{}"))
                    .header(HttpHeaders.IF_NONE_MATCH, "*"))
                .andExpect(status().isBadRequest());
        }
    }
}
