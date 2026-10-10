package fm.tierlist.settings;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Runs Flyway + Hibernate `validate` against a real Postgres 17, so the enum
// types, CHECK constraints and optimistic locking are exercised for real.
@SpringBootTest(properties = {
    "spring.security.oauth2.client.registration.google.client-id=test",
    "spring.security.oauth2.client.registration.google.client-secret=test",
})
@AutoConfigureMockMvc
@Testcontainers
class SettingsControllerIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");

    private static final String BODY = """
        {"appearance": {"theme": "%s", "accent": "violet", "tierPalette": "heat"},
         "naming": {"template": "%s", "tierLabels": %s, "tierDisplayNames": %s, "migratingFrom": %s, "migratingFromTierLabels": %s, "todoLinks": %s}}""";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate jdbc;

    private final RequestPostProcessor alice = oidcLogin().idToken(t -> t.subject("alice"));

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM app_user");
    }

    private static final String DEFAULT_LABELS = labels("S", "A", "B", "C", "D", "TODO");

    private static String labels(String s, String a, String b, String c, String d, String todo) {
        return """
            {"S": "%s", "A": "%s", "B": "%s", "C": "%s", "D": "%s", "TODO": "%s"}""".formatted(s, a, b, c, d, todo);
    }

    private MockHttpServletRequestBuilder save(String theme, String template) {
        return save(theme, template, DEFAULT_LABELS, "{}");
    }

    private MockHttpServletRequestBuilder save(String theme, String template, String tierLabels, String todoLinks) {
        return save(theme, template, tierLabels, "null", "null", todoLinks);
    }

    private MockHttpServletRequestBuilder save(String theme, String template, String tierLabels,
                                               String migratingFrom, String migratingFromTierLabels, String todoLinks) {
        return saveShown(theme, template, tierLabels, "null", migratingFrom, migratingFromTierLabels, todoLinks);
    }

    private MockHttpServletRequestBuilder saveShown(String theme, String template, String tierLabels, String shown,
                                                    String migratingFrom, String migratingFromTierLabels, String todoLinks) {
        return put("/api/settings").with(alice).contentType(MediaType.APPLICATION_JSON)
            .content(BODY.formatted(theme, template, tierLabels, shown, migratingFrom, migratingFromTierLabels, todoLinks));
    }

    @Test
    void createReadUpdateWithVersionedETags() throws Exception {
        mvc.perform(get("/api/settings").with(alice)).andExpect(status().isNoContent());

        mvc.perform(save("dracula", "[{tag}] {category} {tier}").header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.ETAG, "\"0\""))
            .andExpect(jsonPath("$.appearance.theme").value("dracula"))
            .andExpect(jsonPath("$.prefs").doesNotExist());

        mvc.perform(get("/api/settings").with(alice))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.ETAG, "\"0\""))
            .andExpect(jsonPath("$.naming.template").value("[{tag}] {category} {tier}"));

        mvc.perform(save("paper", "{category} {tier}").header(HttpHeaders.IF_MATCH, "\"0\""))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.ETAG, "\"1\""));

        // Stored as the native enum, labelled by the Java constant.
        assertThat(jdbc.queryForObject("SELECT pg_typeof(theme)::text || ':' || theme FROM user_settings", String.class))
            .isEqualTo("theme_option:PAPER");
    }

    // Settings -> Duels (the `prefs` group) was retired; a tab loaded before
    // that still sends it, and the save must not fail because of it.
    @Test
    void anOldClientStillSendingPrefsIsAccepted() throws Exception {
        String old = BODY.formatted("sand", "{category} {tier}", DEFAULT_LABELS, "null", "null", "null", "{}")
            .replaceFirst("}}$", "}, \"prefs\": {\"duelStrategy\": \"elo\"}}");
        assertThat(old).contains("\"prefs\"");

        mvc.perform(put("/api/settings").with(alice).contentType(MediaType.APPLICATION_JSON).content(old)
                .header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.appearance.theme").value("sand"))
            .andExpect(jsonPath("$.prefs").doesNotExist());
    }

    @Test
    void staleOrMissingPreconditionsAreRefused() throws Exception {
        mvc.perform(save("tokyo", "{category} {tier}")).andExpect(status().isPreconditionRequired());
        mvc.perform(save("tokyo", "{category} {tier}").header(HttpHeaders.IF_MATCH, "\"0\""))
            .andExpect(status().isPreconditionFailed()); // no row yet

        mvc.perform(save("tokyo", "{category} {tier}").header(HttpHeaders.IF_NONE_MATCH, "*")).andExpect(status().isOk());
        mvc.perform(save("sand", "{category} {tier}").header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isPreconditionFailed()); // row exists now
        mvc.perform(save("sand", "{category} {tier}").header(HttpHeaders.IF_MATCH, "\"0\"")).andExpect(status().isOk());
        mvc.perform(save("charcoal", "{category} {tier}").header(HttpHeaders.IF_MATCH, "\"0\""))
            .andExpect(status().isPreconditionFailed()) // another device already saved v1
            .andExpect(content -> assertThat(content.getResponse().getContentType()).isEqualTo("application/problem+json"));
    }

    @Test
    void unknownOptionsAndBadTemplatesAreRejected() throws Exception {
        mvc.perform(save("neon", "{category} {tier}").header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isBadRequest());
        mvc.perform(save("tokyo", "{category} only").header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isBadRequest());
        mvc.perform(get("/api/settings").with(alice)).andExpect(status().isNoContent());
    }

    @Test
    void tierNamesAndLinksRoundTripAndShareTheRowVersion() throws Exception {
        // Kept as typed, symbols and all - that's how renames write them.
        String mine = labels("T1", "T2", "T3", "TE", "TZ", "(**TODO**)");
        mvc.perform(save("tokyo", "[{tag}] {category} {tier}", mine, "{\"PLabc_123\": \"Rap\"}")
                .header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.naming.tierLabels.S").value("T1"))
            .andExpect(jsonPath("$.naming.tierLabels.D").value("TZ"))
            .andExpect(jsonPath("$.naming.tierLabels.TODO").value("(**TODO**)"))
            .andExpect(jsonPath("$.naming.migratingFromTierLabels").isEmpty())
            .andExpect(jsonPath("$.naming.todoLinks.PLabc_123").value("Rap"))
            .andExpect(header().string(HttpHeaders.ETAG, "\"0\""));
        assertThat(jdbc.queryForObject("SELECT naming_tier_todo FROM user_settings", String.class)).isEqualTo("(**TODO**)");

        // Changing only the links is still a new version (the ETag moves).
        mvc.perform(save("tokyo", "[{tag}] {category} {tier}", mine, "{\"PLabc_123\": \"Jazz_Cozy\", \"PLxyz\": \"Rap\"}")
                .header(HttpHeaders.IF_MATCH, "\"0\""))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.ETAG, "\"1\""));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM todo_list_link", Integer.class)).isEqualTo(2);

        mvc.perform(save("tokyo", "[{tag}] {category} {tier}", mine, "{}").header(HttpHeaders.IF_MATCH, "\"1\""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.naming.todoLinks").isEmpty());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM todo_list_link", Integer.class)).isZero();
    }

    @Test
    void shownNamesAreOptionalMayRepeatAndRoundTrip() throws Exception {
        String mine = labels("T1", "T2", "T3", "TE", "TZ", "(**TODO**)");
        String shown = """
            {"S": "S", "A": "S", "B": null, "C": null, "D": null, "TODO": "TODO"}""";
        mvc.perform(saveShown("tokyo", "{category} {tier}", mine, shown, "null", "null", "{}").header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.naming.tierDisplayNames.TODO").value("TODO"))
            .andExpect(jsonPath("$.naming.tierDisplayNames.A").value("S"))
            .andExpect(jsonPath("$.naming.tierDisplayNames.B").isEmpty());
        assertThat(jdbc.queryForObject("SELECT naming_tier_todo || '/' || naming_tier_todo_shown FROM user_settings", String.class))
            .isEqualTo("(**TODO**)/TODO");
        // None set comes back as all null, not missing.
        mvc.perform(save("tokyo", "{category} {tier}", mine, "{}").header(HttpHeaders.IF_MATCH, "\"0\""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.naming.tierDisplayNames.TODO").isEmpty());
        mvc.perform(saveShown("tokyo", "{category} {tier}", mine, "{\"TODO\": \" x\"}", "null", "null", "{}")
                .header(HttpHeaders.IF_MATCH, "\"1\""))
            .andExpect(status().isBadRequest());
    }

    @Test
    void anUnfinishedRenameKeepsTheWholePreviousNaming() throws Exception {
        // Only the tier names changed: still a migration (old names stay recognised).
        mvc.perform(save("tokyo", "{category} {tier}", labels("T1", "T2", "T3", "TE", "TZ", "TODO"),
                "\"{category} {tier}\"", DEFAULT_LABELS, "{}").header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.naming.migratingFrom").value("{category} {tier}"))
            .andExpect(jsonPath("$.naming.migratingFromTierLabels.S").value("S"));
        // Half a previous naming, or the same one again, is refused.
        mvc.perform(save("tokyo", "{category} {tier}", DEFAULT_LABELS, "\"{category} - {tier}\"", "null", "{}")
                .header(HttpHeaders.IF_MATCH, "\"0\""))
            .andExpect(status().isBadRequest());
        mvc.perform(save("tokyo", "{category} {tier}", DEFAULT_LABELS, "\"{category} {tier}\"", DEFAULT_LABELS, "{}")
                .header(HttpHeaders.IF_MATCH, "\"0\""))
            .andExpect(status().isBadRequest());
    }

    @Test
    void badTierNamesAndLinksAreRejected() throws Exception {
        for (String bad : new String[] {
            labels("S", "S", "B", "C", "D", "TODO"),          // two tiers called S
            labels("S", "A", "B", "C", "D", "(**s**)"),       // same words as S
            labels("S", "A", "B", "C", "D", ""),              // blank
            labels("S", "A", "B", "C", "D", " TODO"),         // surrounding space
            labels("S", "A", "{tier}", "C", "D", "TODO"),     // braces
            labels("S", "A", "B", "C", "D", "averyveryverylongname"),
            "{\"S\": \"S\"}",                                  // missing tiers
        }) {
            mvc.perform(save("tokyo", "{category} {tier}", bad, "{}").header(HttpHeaders.IF_NONE_MATCH, "*"))
                .andExpect(status().isBadRequest());
        }
        mvc.perform(save("tokyo", "{category} {tier}", DEFAULT_LABELS, "{\"bad id!\": \"Rap\"}").header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isBadRequest());
        mvc.perform(save("tokyo", "{category} {tier}", DEFAULT_LABELS, "{\"PLabc\": \" \"}").header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isBadRequest());
        mvc.perform(get("/api/settings").with(alice)).andExpect(status().isNoContent());
    }

    @Test
    void requiresLogin() throws Exception {
        mvc.perform(get("/api/settings")).andExpect(status().isUnauthorized());
    }
}
