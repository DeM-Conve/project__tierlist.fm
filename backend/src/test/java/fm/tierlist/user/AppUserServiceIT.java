package fm.tierlist.user;

import fm.tierlist.PostgresIT;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class AppUserServiceIT extends PostgresIT {

    @Autowired
    AppUserService users;

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM app_user");
    }

    static Authentication google(String sub, String name, String picture) {
        OidcIdToken token = OidcIdToken.withTokenValue("id-token").subject(sub)
            .claim("name", name).claim("picture", picture)
            .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        return new OAuth2AuthenticationToken(new DefaultOidcUser(AuthorityUtils.createAuthorityList("OIDC_USER"), token),
            AuthorityUtils.createAuthorityList("OIDC_USER"), "google");
    }

    private Map<String, Object> stored(String id) {
        return jdbc.queryForMap("SELECT * FROM app_user WHERE id = ?", id);
    }

    @Test
    void theFirstLoginCreatesTheUserWithTheirGoogleProfile() {
        AppUser user = users.recordLogin(google("sub-1", "Test User", "https://example.com/p.png"));

        assertThat(user.getId()).isEqualTo("sub-1");
        Map<String, Object> row = stored("sub-1");
        assertThat(row.get("display_name")).isEqualTo("Test User");
        assertThat(row.get("picture_url")).isEqualTo("https://example.com/p.png");
        assertThat(row.get("created_at")).isNotNull();
        assertThat(row.get("last_login_at")).isNotNull();
    }

    @Test
    void laterLoginsRefreshTheProfileAndLastLoginButKeepCreatedAt() {
        users.recordLogin(google("sub-1", "Old Name", null));
        jdbc.update("UPDATE app_user SET created_at = now() - interval '1 day', last_login_at = now() - interval '1 day'");
        OffsetDateTime created = jdbc.queryForObject("SELECT created_at FROM app_user", OffsetDateTime.class);

        users.recordLogin(google("sub-1", "New Name", "https://example.com/new.png"));

        assertThat(jdbc.queryForObject("SELECT count(*) FROM app_user", Integer.class)).isEqualTo(1);
        Map<String, Object> row = stored("sub-1");
        assertThat(row.get("display_name")).isEqualTo("New Name");
        assertThat(row.get("picture_url")).isEqualTo("https://example.com/new.png");
        assertThat(jdbc.queryForObject("SELECT created_at FROM app_user", OffsetDateTime.class)).isEqualTo(created);
        assertThat(jdbc.queryForObject("SELECT last_login_at > created_at + interval '1 hour' FROM app_user", Boolean.class)).isTrue();
    }

    @Test
    void aNonOidcLoginIsRecordedWithoutProfileDetails() {
        DefaultOAuth2User plain = new DefaultOAuth2User(AuthorityUtils.createAuthorityList("OAUTH2_USER"),
            Map.of("sub", "sub-2", "name", "Ignored"), "sub");
        users.recordLogin(new OAuth2AuthenticationToken(plain, plain.getAuthorities(), "google"));

        Map<String, Object> row = stored("sub-2");
        assertThat(row.get("display_name")).isNull();
        assertThat(row.get("picture_url")).isNull();
    }

    @Test
    void currentCreatesAMissingUserAndOtherwiseLeavesTheRowAlone() {
        AppUser created = users.current(google("sub-3", "Someone", null));
        assertThat(created.getId()).isEqualTo("sub-3");
        assertThat(stored("sub-3").get("display_name")).isEqualTo("Someone");

        jdbc.update("UPDATE app_user SET last_login_at = '2020-01-01T00:00:00Z', display_name = 'Kept'");
        AppUser again = users.current(google("sub-3", "Changed", null));

        assertThat(again.getId()).isEqualTo("sub-3");
        assertThat(stored("sub-3").get("display_name")).isEqualTo("Kept");
        assertThat(jdbc.queryForObject("SELECT extract(year FROM last_login_at)::int FROM app_user", Integer.class)).isEqualTo(2020);
    }
}
