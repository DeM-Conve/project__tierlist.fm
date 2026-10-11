package fm.tierlist.settings;

import fm.tierlist.PostgresIT;
import fm.tierlist.settings.WritePrecondition.MustMatch;
import fm.tierlist.settings.WritePrecondition.MustNotExist;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// SettingsService's rules against real Postgres: preconditions, versions
// (including the hand-bumped one for to-do links) and what a refusal leaves behind.
class SettingsServiceIT extends PostgresIT {

    @Autowired
    SettingsService service;

    @Autowired
    JdbcTemplate jdbc;

    private static final Appearance LOOK = new Appearance(Theme.TOKYO, Accent.BLUE, TierPalette.VIVID);
    private static final Naming NAMING = new Naming("{category} {tier}", new TierLabels("S", "A", "B", "C", "D", "TODO"),
        null, null, null);

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM app_user");
        jdbc.update("INSERT INTO app_user (id) VALUES ('alice')");
    }

    private long dbVersion() {
        return jdbc.queryForObject("SELECT version FROM user_settings WHERE user_id = 'alice'", Long.class);
    }

    private UserSettings save(WritePrecondition p, Appearance look, Map<String, String> links) {
        return service.save("alice", p, look, NAMING, links, null);
    }

    @Test
    void nothingSavedIsEmpty() {
        assertThat(service.find("alice")).isEmpty();
        assertThat(service.find("nobody")).isEmpty();
    }

    @Test
    void theFirstSaveCreatesVersion0AndFindReadsItBack() {
        UserSettings row = save(new MustNotExist(), LOOK, Map.of("PL1", "Rap"));

        assertThat(row.getVersion()).isZero();
        UserSettings found = service.find("alice").orElseThrow();
        assertThat(found.getAppearance()).isEqualTo(LOOK);
        assertThat(found.getNaming()).isEqualTo(NAMING);
        assertThat(found.getTodoLinks()).containsExactly(Map.entry("PL1", "Rap"));
    }

    @Test
    void eachChangeIsANewVersionAndTheReturnedOneIsTheStoredOne() {
        save(new MustNotExist(), LOOK, Map.of());

        UserSettings v1 = save(new MustMatch(0), new Appearance(Theme.SAND, Accent.BLUE, TierPalette.VIVID), Map.of());
        assertThat(v1.getVersion()).isEqualTo(1).isEqualTo(dbVersion());

        UserSettings linksOnly = save(new MustMatch(1), new Appearance(Theme.SAND, Accent.BLUE, TierPalette.VIVID), Map.of("PL1", "Rap"));
        assertThat(linksOnly.getVersion()).isEqualTo(2).isEqualTo(dbVersion());

        UserSettings linkRemoved = save(new MustMatch(2), new Appearance(Theme.SAND, Accent.BLUE, TierPalette.VIVID), Map.of());
        assertThat(linkRemoved.getVersion()).isEqualTo(3).isEqualTo(dbVersion());

        UserSettings both = save(new MustMatch(3), LOOK, Map.of("PL2", "Jazz"));
        assertThat(both.getVersion()).isEqualTo(dbVersion()).isGreaterThan(3);
        assertThat(service.find("alice").orElseThrow().getTodoLinks()).containsOnlyKeys("PL2");
    }

    @Test
    void anIdenticalSaveIsNotANewVersion() {
        save(new MustNotExist(), LOOK, Map.of("PL1", "Rap"));

        assertThat(save(new MustMatch(0), LOOK, Map.of("PL1", "Rap")).getVersion()).isZero();
        assertThat(dbVersion()).isZero();
    }

    @Test
    void aFailedPreconditionIsAConflictAndChangesNothing() {
        assertThatThrownBy(() -> save(new MustMatch(0), LOOK, Map.of())).isInstanceOf(SettingsConflictException.class);
        assertThat(service.find("alice")).isEmpty();

        save(new MustNotExist(), LOOK, Map.of("PL1", "Rap"));
        assertThatThrownBy(() -> save(new MustNotExist(), LOOK, Map.of())).isInstanceOf(SettingsConflictException.class);
        assertThatThrownBy(() -> save(new MustMatch(7), new Appearance(Theme.PAPER, Accent.RED, TierPalette.HEAT), Map.of()))
            .isInstanceOf(SettingsConflictException.class);

        UserSettings stored = service.find("alice").orElseThrow();
        assertThat(stored.getAppearance()).isEqualTo(LOOK);
        assertThat(stored.getTodoLinks()).containsOnlyKeys("PL1");
        assertThat(dbVersion()).isZero();
    }

    @Test
    void anActivityOrderChangeAloneIsANewVersion() {
        List<ActivityItem> mine = List.of(ActivityItem.PLAYLISTS, ActivityItem.HOME, ActivityItem.JUMP,
            ActivityItem.BOARDS, ActivityItem.ADD_SONGS, ActivityItem.DUELS);
        UserSettings first = service.save("alice", new MustNotExist(), LOOK, NAMING, Map.of(), null);
        assertThat(first.getVersion()).isZero();
        assertThat(service.find("alice").orElseThrow().getActivityOrder()).isEqualTo(ActivityItem.DEFAULT_ORDER);

        UserSettings reordered = service.save("alice", new MustMatch(0), LOOK, NAMING, Map.of(), mine);
        assertThat(reordered.getVersion()).isEqualTo(1).isEqualTo(dbVersion());
        assertThat(service.find("alice").orElseThrow().getActivityOrder()).isEqualTo(mine);

        // The same order, or a partial list completing to it, is no change.
        assertThat(service.save("alice", new MustMatch(1), LOOK, NAMING, Map.of(), List.of(ActivityItem.PLAYLISTS)).getVersion())
            .isEqualTo(1);
        assertThat(dbVersion()).isEqualTo(1);

        UserSettings back = service.save("alice", new MustMatch(1), LOOK, NAMING, Map.of(), null);
        assertThat(back.getVersion()).isEqualTo(2).isEqualTo(dbVersion());
        assertThat(service.find("alice").orElseThrow().getActivityOrder()).isEqualTo(ActivityItem.DEFAULT_ORDER);
    }

    @Test
    void aRowSavedWithoutActivityRowsReadsAsTheDefaultOrder() {
        service.save("alice", new MustNotExist(), LOOK, NAMING, Map.of(), null);
        jdbc.update("DELETE FROM activity_bar_item");

        assertThat(service.find("alice").orElseThrow().getActivityOrder()).isEqualTo(ActivityItem.DEFAULT_ORDER);
    }

    @Test
    void settingsNeedARecordedUser() {
        // The FK to app_user; the controller records the user first (AppUserService.current).
        assertThatThrownBy(() -> service.save("stranger", new MustNotExist(), LOOK, NAMING, Map.of(), null))
            .isInstanceOf(DataIntegrityViolationException.class);
    }
}
