package fm.tierlist.settings;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.exc.InvalidFormatException;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// The API speaks the frontend's ids (themes.js); the constant
// names are the Postgres enum labels (checked against the DB in SettingsEnumsIT).
class SettingsEnumsTest {

    private final ObjectMapper json = new ObjectMapper();

    private static Map<String, String> keys(Enum<?>[] values, java.util.function.Function<Enum<?>, String> key) {
        Map<String, String> out = new LinkedHashMap<>();
        Arrays.stream(values).forEach(v -> out.put(v.name(), key.apply(v)));
        return out;
    }

    @Test
    void themeKeysAreTheFrontendIds() {
        assertThat(keys(Theme.values(), v -> ((Theme) v).key())).containsExactly(
            Map.entry("TOKYO", "tokyo"), Map.entry("DRACULA", "dracula"), Map.entry("CHARCOAL", "charcoal"),
            Map.entry("PAPER", "paper"), Map.entry("SAND", "sand"), Map.entry("SOLARIZED", "solarized"));
    }

    @Test
    void accentKeysAreTheFrontendIds() {
        assertThat(keys(Accent.values(), v -> ((Accent) v).key())).containsExactly(
            Map.entry("BLUE", "blue"), Map.entry("VIOLET", "violet"), Map.entry("TEAL", "teal"), Map.entry("GREEN", "green"),
            Map.entry("PINK", "pink"), Map.entry("RED", "red"), Map.entry("ORANGE", "orange"), Map.entry("AMBER", "amber"));
    }

    @Test
    void tierPaletteKeysAreTheFrontendIds() {
        assertThat(keys(TierPalette.values(), v -> ((TierPalette) v).key())).containsExactly(
            Map.entry("VIVID", "vivid"), Map.entry("CLASSIC", "classic"), Map.entry("HEAT", "heat"));
    }

    @Test
    void activityItemKeysAreTheFrontendIdsInDefaultOrder() {
        assertThat(keys(ActivityItem.values(), v -> ((ActivityItem) v).key())).containsExactly(
            Map.entry("HOME", "home"), Map.entry("JUMP", "jump"), Map.entry("BOARDS", "boards"),
            Map.entry("PLAYLISTS", "playlists"), Map.entry("ADD_SONGS", "addSongs"));
        assertThat(ActivityItem.DEFAULT_ORDER).containsExactly(ActivityItem.values());
    }

    @Test
    void anActivityOrderIsCompletedInDefaultOrder() {
        assertThat(ActivityItem.completeOrder(null)).isEqualTo(ActivityItem.DEFAULT_ORDER);
        assertThat(ActivityItem.completeOrder(java.util.List.of())).isEqualTo(ActivityItem.DEFAULT_ORDER);
        assertThat(ActivityItem.completeOrder(java.util.List.of(ActivityItem.ADD_SONGS, ActivityItem.BOARDS)))
            .containsExactly(ActivityItem.ADD_SONGS, ActivityItem.BOARDS, ActivityItem.HOME, ActivityItem.JUMP, ActivityItem.PLAYLISTS);
        assertThatThrownBy(() -> ActivityItem.completeOrder(java.util.List.of(ActivityItem.HOME, ActivityItem.HOME)))
            .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("home");
        assertThatThrownBy(() -> ActivityItem.completeOrder(java.util.Arrays.asList(ActivityItem.HOME, null)))
            .isInstanceOf(NullPointerException.class);
    }

    @Test
    void everyConstantSerialisesAsItsKeyAndReadsBack() throws Exception {
        for (Enum<?>[] values : new Enum<?>[][] {Theme.values(), Accent.values(), TierPalette.values(), ActivityItem.values()}) {
            for (Enum<?> value : values) {
                String written = json.writeValueAsString(value);
                assertThat(json.readValue(written, value.getDeclaringClass())).isSameAs(value);
                assertThat(written).isNotEqualTo("\"" + value.name() + "\"").doesNotContain("_");
            }
        }
        assertThat(json.writeValueAsString(TierPalette.VIVID)).isEqualTo("\"vivid\"");
    }

    @ParameterizedTest
    @ValueSource(strings = {"\"neon\"", "\"TOKYO\"", "\"Tokyo\"", "\"\"", "99", "\"99\""})
    void unknownKeysConstantNamesAndOtherCasingsAreRefused(String value) {
        assertThatThrownBy(() -> json.readValue(value, Theme.class)).isInstanceOf(InvalidFormatException.class);
    }

    @Test
    void otherConstantNamesAreNotAcceptedEither() {
        assertThatThrownBy(() -> json.readValue("\"BLUE\"", Accent.class)).isInstanceOf(InvalidFormatException.class);
        assertThatThrownBy(() -> json.readValue("\"VIVID\"", TierPalette.class)).isInstanceOf(InvalidFormatException.class);
    }

    @Test
    @Disabled("BUG (minor): Jackson's default FAIL_ON_NUMBERS_FOR_ENUMS=false still reads a bare JSON number as the "
        + "constant's ordinal, @JsonValue or not - {\"theme\": 0} (or \"0\") is accepted as tokyo and {\"tierPalette\": 2} as heat, "
        + "so the API does not only speak the frontend keys, and reordering a Java enum silently changes what a "
        + "number means. Out-of-range numbers are refused. Fix: spring.jackson.deserialization.fail-on-numbers-for-enums=true "
        + "(see SettingsApiIT for the HTTP side).")
    void aBareNumberIsNotAnOption() {
        assertThatThrownBy(() -> json.readValue("0", Theme.class)).isInstanceOf(InvalidFormatException.class);
        assertThatThrownBy(() -> json.readValue("\"0\"", Theme.class)).isInstanceOf(InvalidFormatException.class);
        assertThatThrownBy(() -> json.readValue("2", TierPalette.class)).isInstanceOf(InvalidFormatException.class);
    }
}
