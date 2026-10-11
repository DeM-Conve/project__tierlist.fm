package fm.tierlist.settings;

import fm.tierlist.PostgresIT;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// The schema's own last line of defence (V1): enum types, CHECK constraints,
// keys and cascades, written straight with SQL so no Java validation is in the way.
class DatabaseConstraintsIT extends PostgresIT {

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM app_user");
        jdbc.update("INSERT INTO app_user (id) VALUES ('alice')");
    }

    // A valid row as SQL literals; each test overrides a column or two.
    private static Map<String, String> row() {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("user_id", "'alice'");
        r.put("theme", "'TOKYO'");
        r.put("accent", "'BLUE'");
        r.put("tier_palette", "'VIVID'");
        r.put("naming_template", "'{category} {tier}'");
        r.put("naming_tier_s", "'S'");
        r.put("naming_tier_a", "'A'");
        r.put("naming_tier_b", "'B'");
        r.put("naming_tier_c", "'C'");
        r.put("naming_tier_d", "'D'");
        r.put("naming_tier_todo", "'TODO'");
        return r;
    }

    private void insert(Map<String, String> r) {
        jdbc.update("INSERT INTO user_settings (" + String.join(", ", r.keySet()) + ") VALUES (" + String.join(", ", r.values()) + ")");
    }

    private void insertWith(String... columnValuePairs) {
        Map<String, String> r = row();
        for (int i = 0; i < columnValuePairs.length; i += 2) {
            r.put(columnValuePairs[i], columnValuePairs[i + 1]);
        }
        insert(r);
    }

    private static String sql(String s) {
        return s == null ? "NULL" : "'" + s.replace("'", "''") + "'";
    }

    @Test
    void aValidRowIsAccepted() {
        insertWith("naming_tier_todo", "'(**TODO**)'", "naming_tier_s_shown", "'S'", "naming_tier_a_shown", "'S'");
        assertThat(jdbc.queryForObject("SELECT version FROM user_settings", Long.class)).isZero();
    }

    @Test
    void enumLabelsAreExactlyTheJavaConstantNames() {
        Map<String, Enum<?>[]> types = Map.of(
            "theme_option", Theme.values(), "accent_option", Accent.values(),
            "tier_palette_option", TierPalette.values(), "activity_item", ActivityItem.values());
        types.forEach((type, values) -> assertThat(
                jdbc.queryForList("SELECT unnest(enum_range(NULL::" + type + "))::text", String.class))
            .as(type)
            .containsExactlyElementsOf(Arrays.stream(values).map(Enum::name).toList()));
    }

    @ParameterizedTest
    @CsvSource({"theme, tokyo", "accent, CYAN", "tier_palette, vivid"})
    void anUnknownEnumLabelIsRefused(String column, String value) {
        assertThatThrownBy(() -> insertWith(column, sql(value)))
            .isInstanceOf(DataAccessException.class).hasMessageContaining("invalid input value for enum");
    }

    @ParameterizedTest
    @ValueSource(strings = {"{category} only", "{tier} only", "no tokens"})
    void aTemplateWithoutBothTokensIsRefused(String template) {
        assertThatThrownBy(() -> insertWith("naming_template", sql(template)))
            .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("naming_template_has_tokens");
    }

    @ParameterizedTest
    @ValueSource(strings = {" S", "S ", "(**)", "{S}", "", "S{"})
    void anInvalidTierNameIsRefused(String label) {
        assertThatThrownBy(() -> insertWith("naming_tier_s", sql(label)))
            .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("naming_tier_labels_valid");
    }

    @Test
    void aTierNameLongerThan20IsRefused() {
        assertThatThrownBy(() -> insertWith("naming_tier_s", sql("x".repeat(21)))).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aMissingTierNameIsRefused() {
        assertThatThrownBy(() -> insertWith("naming_tier_d", "NULL")).isInstanceOf(DataIntegrityViolationException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"s", "(**s**)", " s", "S!"})
    void twoTiersWithTheSameWordsAreRefused(String todo) {
        assertThatThrownBy(() -> insertWith("naming_tier_todo", sql(todo))).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void shownNamesAreOptionalMayRepeatButMustBeValid() {
        insertWith("naming_tier_s_shown", "'X'", "naming_tier_a_shown", "'X'");
        jdbc.update("DELETE FROM user_settings");
        assertThatThrownBy(() -> insertWith("naming_tier_todo_shown", "' TODO'"))
            .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("naming_tier_shown_valid");
    }

    private String[] migration(String template, String s) {
        return new String[] {"naming_migrating_from", sql(template),
            "naming_migrating_from_tier_s", sql(s), "naming_migrating_from_tier_a", "'A'", "naming_migrating_from_tier_b", "'B'",
            "naming_migrating_from_tier_c", "'C'", "naming_migrating_from_tier_d", "'D'", "naming_migrating_from_tier_todo", "'TODO'"};
    }

    @Test
    void aCompletePreviousNamingIsAccepted() {
        insertWith(migration("[{tag}] {category} {tier}", "T1"));
        assertThat(jdbc.queryForObject("SELECT naming_migrating_from_tier_s FROM user_settings", String.class)).isEqualTo("T1");
    }

    @Test
    void halfAPreviousNamingIsRefused() {
        // (with no previous tier names, naming_migrating_from_tier_labels_valid also catches it)
        assertThatThrownBy(() -> insertWith("naming_migrating_from", "'{category} - {tier}'"))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertWith(migration(null, "T1")))
            .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("naming_migration_complete");
    }

    @Test
    void aPreviousNamingIsCheckedLikeTheCurrentOne() {
        assertThatThrownBy(() -> insertWith(migration("{category} only", "T1")))
            .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("naming_migrating_from_has_tokens");
        assertThatThrownBy(() -> insertWith(migration("{category} {tier}", " T1")))
            .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("naming_migrating_from_tier_labels_valid");
        assertThatThrownBy(() -> insertWith(migration("{category} {tier}", "a")))
            .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("naming_migrating_from_tier_labels_valid");
    }

    @Test
    void settingsBelongToARecordedUserAndGoWithIt() {
        assertThatThrownBy(() -> insertWith("user_id", "'stranger'")).isInstanceOf(DataIntegrityViolationException.class);

        insert(row());
        jdbc.update("INSERT INTO todo_list_link (user_id, playlist_id, category) VALUES ('alice', 'PL1', 'Rap')");
        jdbc.update("DELETE FROM app_user WHERE id = 'alice'");

        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_settings", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM todo_list_link", Integer.class)).isZero();
    }

    private void item(int position, String item) {
        jdbc.update("INSERT INTO activity_bar_item (user_id, position, item) VALUES ('alice', ?, ?::activity_item)", position, item);
    }

    @Test
    void activityBarItemsBelongToASettingsRowAndGoWithIt() {
        assertThatThrownBy(() -> item(0, "HOME")).isInstanceOf(DataIntegrityViolationException.class);
        insert(row());
        item(0, "HOME");
        item(1, "ADD_SONGS");
        item(2, "DUELS"); // added by V2
        jdbc.update("DELETE FROM user_settings");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM activity_bar_item", Integer.class)).isZero();
    }

    @Test
    void eachActivityItemAndPositionOnceAndOnlyKnownItems() {
        insert(row());
        item(0, "HOME");
        assertThatThrownBy(() -> item(0, "JUMP")).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> item(1, "HOME"))
            .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("activity_item_once");
        assertThatThrownBy(() -> item(-1, "JUMP")).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> item(1, "home")).isInstanceOf(DataAccessException.class).hasMessageContaining("invalid input value for enum");
        assertThatThrownBy(() -> item(1, "SETTINGS")).isInstanceOf(DataAccessException.class).hasMessageContaining("invalid input value for enum");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM activity_bar_item", Integer.class)).isEqualTo(1);
    }

    @Test
    void oneRowPerUser() {
        insert(row());
        assertThatThrownBy(() -> insert(row())).isInstanceOf(DataIntegrityViolationException.class);
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {"bad id!|Rap", "''|Rap", "PL1|'  '", "PL1|''", "PL1|", "PL.1|Rap"})
    void aBadTodoLinkIsRefused(String playlistId, String category) {
        insert(row());
        assertThatThrownBy(() -> jdbc.update("INSERT INTO todo_list_link (user_id, playlist_id, category) VALUES ('alice', ?, ?)",
            playlistId, category)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aPlaylistIsLinkedOnceAndOnlyForAUserWithSettings() {
        assertThatThrownBy(() -> jdbc.update("INSERT INTO todo_list_link (user_id, playlist_id, category) VALUES ('alice', 'PL1', 'Rap')"))
            .isInstanceOf(DataIntegrityViolationException.class);
        insert(row());
        jdbc.update("INSERT INTO todo_list_link (user_id, playlist_id, category) VALUES ('alice', 'PL_1-x', 'Rap')");
        assertThatThrownBy(() -> jdbc.update("INSERT INTO todo_list_link (user_id, playlist_id, category) VALUES ('alice', 'PL_1-x', 'Jazz')"))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    // Wherever both sides decide, @TierLabel / isDistinct and the SQL functions agree
    // (see SettingsApiIT for the characters where they don't).
    @ParameterizedTest
    @ValueSource(strings = {"S", "T1", "(**TODO**)", "À faire", "to-do", "A+", " S", "S ", "(**)", "+", "{tier}", "a}", "一", "Ⅻ"})
    void theJavaAndSqlTierNameRulesAgree(String label) {
        boolean java = new TierLabelValidator().isValid(label, null);
        assertThat(jdbc.queryForObject("SELECT tier_label_valid(?)", Boolean.class, label)).as(label).isEqualTo(java);
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {"S|s|false", "TODO|(**todo**)|false", "to do|to-do|false", "S|A|true", "T1|T2|true"})
    void theJavaAndSqlDistinctnessRulesAgree(String one, String other, boolean distinct) {
        assertThat(new SettingsDto.TierLabelsDto(one, other, "B", "C", "D", "TODO").isDistinct()).isEqualTo(distinct);
        assertThat(jdbc.queryForObject("SELECT tier_labels_distinct(?, ?, 'B', 'C', 'D', 'TODO')", Boolean.class, one, other))
            .isEqualTo(distinct);
    }
}
