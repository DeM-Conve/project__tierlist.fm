package fm.tierlist.db;

import fm.tierlist.PostgresIT;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

import static org.assertj.core.api.Assertions.assertThat;

// The live database was created by an older release and moves forward one
// migration at a time - never from empty, like every other IT. This replays
// that path in a schema of its own: a database at V2 holding a real account
// takes the newer migrations without losing or breaking it, and the result
// validates (Flyway's checksums) like a fresh install.
class MigrationsIT extends PostgresIT {

    private static final String SCHEMA = "upgrade_check";

    @Autowired
    DataSource dataSource;

    @Autowired
    JdbcTemplate jdbc;

    private Flyway flyway(String target) {
        return Flyway.configure().dataSource(dataSource).schemas(SCHEMA).defaultSchema(SCHEMA)
            .locations("classpath:db/migration").target(target).cleanDisabled(false).load();
    }

    @AfterEach
    void dropSchema() {
        jdbc.execute("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
    }

    @Test
    void aV2DatabaseWithAnAccountUpgradesToTheLatestAndValidates() {
        flyway("2").migrate();
        jdbc.update("INSERT INTO " + SCHEMA + ".app_user (id, display_name) VALUES ('alice', 'Alice')");
        jdbc.update("""
                INSERT INTO %s.user_settings (user_id, theme, accent, tier_palette, naming_template,
                    naming_tier_s, naming_tier_a, naming_tier_b, naming_tier_c, naming_tier_d, naming_tier_todo, version)
                VALUES ('alice', 'DRACULA', 'TEAL', 'HEAT', '{category} {tier}', 'S', 'A', 'B', 'C', 'D', 'TODO', 7)""".formatted(SCHEMA));
        jdbc.update("INSERT INTO " + SCHEMA + ".activity_bar_item (user_id, position, item) VALUES ('alice', 0, 'DUELS')");

        var result = flyway("latest").migrate();
        assertThat(result.success).isTrue();
        flyway("latest").validate();

        assertThat(jdbc.queryForObject("SELECT theme::text || '/' || version || '/' || duel_tier_borders::text FROM "
            + SCHEMA + ".user_settings WHERE user_id = 'alice'", String.class)).isEqualTo("DRACULA/7/LEARNED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + SCHEMA + ".activity_bar_item", Integer.class)).isEqualTo(1);
        // Every migration on the classpath is applied, in this schema too.
        assertThat(flyway("latest").info().pending()).isEmpty();
    }
}
