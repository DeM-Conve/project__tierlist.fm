package fm.tierlist.settings;

import fm.tierlist.PostgresIT;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
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

    @Test
    @Disabled("BUG (minor): Boot's ObjectMapper leaves FAIL_ON_NUMBERS_FOR_ENUMS off, so an enum option sent as a "
        + "number (or numeric string) is read as the Java constant's ordinal: {\"theme\": 0} saves tokyo, "
        + "{\"tierPalette\": \"2\"} saves heat. Only frontend keys should be accepted (400 otherwise).")
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

    @Test
    @Disabled("BUG: SettingsDto.NamingDto.isMigratingFromDistinct() NPEs when migratingFrom equals the template and "
        + "migratingFromTierLabels is null; Bean Validation wraps it in a ValidationException, so this half-a-migration "
        + "body is a 500 instead of the 400 its sibling cases get.")
    void halfAMigrationFromTheCurrentTemplateIs400() throws Exception {
        mvc.perform(save(alice, body("\"tokyo\"", "\"blue\"", "\"vivid\"", LABELS, "\"{category} {tier}\"", "null", "{}"))
                .header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @Disabled("BUG: @TierLabel and the DB's tier_label_valid / tier_labels_distinct disagree on characters Java folds "
        + "with NFKD but Postgres' [[:alnum:]] doesn't count: a tier named \"①\" (circled 1) or \"²\" passes "
        + "validation (words -> \"1\"/\"2\") but fails the naming_tier_labels_valid CHECK, and \"S²\" vs \"S\" are "
        + "distinct to Java but equal to naming_tier_labels_distinct. The DataIntegrityViolationException is then "
        + "turned into 412 'Settings changed elsewhere' by SettingsExceptionHandler, so the frontend refetches, "
        + "rebases and retries a save that can never succeed. Expected: 400 (validator and CHECK in step).")
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
