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
         "naming": {"template": "%s", "migratingFrom": null},
         "prefs": {"duelStrategy": "elo", "boardDensity": "compact"}}""";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate jdbc;

    private final RequestPostProcessor alice = oidcLogin().idToken(t -> t.subject("alice"));

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM app_user");
    }

    private MockHttpServletRequestBuilder save(String theme, String template) {
        return put("/api/settings").with(alice).contentType(MediaType.APPLICATION_JSON)
            .content(BODY.formatted(theme, template));
    }

    @Test
    void createReadUpdateWithVersionedETags() throws Exception {
        mvc.perform(get("/api/settings").with(alice)).andExpect(status().isNoContent());

        mvc.perform(save("dracula", "[{tag}] {category} {tier}").header(HttpHeaders.IF_NONE_MATCH, "*"))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.ETAG, "\"0\""))
            .andExpect(jsonPath("$.appearance.theme").value("dracula"))
            .andExpect(jsonPath("$.prefs.duelStrategy").value("elo"))
            .andExpect(jsonPath("$.prefs.boardDensity").value("compact"));

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
    void requiresLogin() throws Exception {
        mvc.perform(get("/api/settings")).andExpect(status().isUnauthorized());
    }
}
