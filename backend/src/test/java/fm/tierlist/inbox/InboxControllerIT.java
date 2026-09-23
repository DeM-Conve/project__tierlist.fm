package fm.tierlist.inbox;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Real Postgres: exercises the composite key, the video-id CHECK and the
// per-user scoping of the Inbox's "Not a song" list.
@SpringBootTest(properties = {
    "spring.security.oauth2.client.registration.google.client-id=test",
    "spring.security.oauth2.client.registration.google.client-secret=test",
})
@AutoConfigureMockMvc
@Testcontainers
class InboxControllerIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");

    private static final String VIDEO = "dQw4w9WgXcQ";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate jdbc;

    private final RequestPostProcessor alice = oidcLogin().idToken(t -> t.subject("alice"));
    private final RequestPostProcessor bob = oidcLogin().idToken(t -> t.subject("bob"));

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM app_user");
    }

    @Test
    void dismissIsIdempotentPerUserAndUndoable() throws Exception {
        mvc.perform(put("/api/inbox/dismissed/" + VIDEO).with(alice).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(put("/api/inbox/dismissed/" + VIDEO).with(alice).with(csrf())).andExpect(status().isNoContent());

        mvc.perform(get("/api/inbox/dismissed").with(alice))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0]").value(VIDEO));
        mvc.perform(get("/api/inbox/dismissed").with(bob))
            .andExpect(jsonPath("$.length()").value(0));

        mvc.perform(delete("/api/inbox/dismissed/" + VIDEO).with(alice).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/inbox/dismissed").with(alice))
            .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void malformedVideoIdIsRejected() throws Exception {
        mvc.perform(put("/api/inbox/dismissed/too-short").with(alice).with(csrf())).andExpect(status().isBadRequest());
    }
}
