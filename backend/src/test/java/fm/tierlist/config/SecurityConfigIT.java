package fm.tierlist.config;

import fm.tierlist.PostgresIT;
import jakarta.servlet.Filter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.client.web.OAuth2LoginAuthenticationFilter;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrlPattern;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SecurityConfigIT extends PostgresIT {

    private static final String FRONTEND = "http://localhost:5173"; // app.frontend-url's default

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    FilterChainProxy filterChain;

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM app_user");
    }

    private AuthenticationSuccessHandler loginSuccessHandler() {
        Filter login = filterChain.getFilterChains().get(0).getFilters().stream()
            .filter(OAuth2LoginAuthenticationFilter.class::isInstance).findFirst().orElseThrow();
        return ReflectionTestUtils.invokeMethod(login, "getSuccessHandler");
    }

    @Test
    void aSuccessfulGoogleLoginRecordsTheUserThenGoesBackToTheApp() throws Exception {
        OidcIdToken token = OidcIdToken.withTokenValue("id").subject("google-sub-1").claim("name", "Test User")
            .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        OAuth2AuthenticationToken auth = new OAuth2AuthenticationToken(
            new DefaultOidcUser(AuthorityUtils.createAuthorityList("OIDC_USER"), token), AuthorityUtils.createAuthorityList("OIDC_USER"), "google");
        MockHttpServletResponse response = new MockHttpServletResponse();

        loginSuccessHandler().onAuthenticationSuccess(new MockHttpServletRequest("GET", "/login/oauth2/code/google"), response, auth);

        assertThat(response.getRedirectedUrl()).isEqualTo(FRONTEND);
        assertThat(jdbc.queryForObject("SELECT display_name FROM app_user WHERE id = 'google-sub-1'", String.class)).isEqualTo("Test User");
    }

    @Test
    void loginStartsGooglesConsentWithTheYoutubeScope() throws Exception {
        mvc.perform(get("/oauth2/authorization/google"))
            .andExpect(status().isFound())
            .andExpect(redirectedUrlPattern("https://accounts.google.com/**"))
            .andExpect(r -> assertThat(r.getResponse().getRedirectedUrl()).contains("youtube.force-ssl").contains("openid"));
    }

    @Test
    void apiCallsWithoutLoginAre401NotARedirect() throws Exception {
        mvc.perform(get("/api/settings")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/anything")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/tier-sync")).andExpect(status().isUnauthorized());
    }

    @Test
    void authStatusAndNonApiPathsArePublic() throws Exception {
        mvc.perform(get("/api/auth/status")).andExpect(status().isOk());
        mvc.perform(get("/not-an-api-path")).andExpect(status().isNotFound());
        mvc.perform(get("/api/anything").with(oidcLogin())).andExpect(status().isNotFound());
    }

    @Test
    void logoutIsAPlain200AndEndsTheSession() throws Exception {
        MockHttpSession session = new MockHttpSession();

        mvc.perform(post("/api/auth/logout").session(session).with(oidcLogin()))
            .andExpect(status().isOk())
            .andExpect(header().doesNotExist(HttpHeaders.LOCATION));
        assertThat(session.isInvalid()).isTrue();
    }

    @Test
    void theFrontendMayCallTheApiWithCredentialsAndReadTheETag() throws Exception {
        mvc.perform(options("/api/settings")
                .header(HttpHeaders.ORIGIN, FRONTEND)
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "PUT")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "If-Match, Content-Type"))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, FRONTEND))
            .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"))
            .andExpect(r -> assertThat(r.getResponse().getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS)).contains("PUT"));

        mvc.perform(get("/api/auth/status").header(HttpHeaders.ORIGIN, FRONTEND))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS, "ETag"));
    }

    @Test
    void anotherOriginIsRefused() throws Exception {
        mvc.perform(options("/api/settings")
                .header(HttpHeaders.ORIGIN, "https://evil.example")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "PUT"))
            .andExpect(status().isForbidden())
            .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
        mvc.perform(options("/api/settings")
                .header(HttpHeaders.ORIGIN, FRONTEND)
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "PATCH"))
            .andExpect(status().isForbidden());
    }
}
