package fm.tierlist.settings;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

// The embeddables refuse to exist half-filled - the NOT NULL columns' Java side.
class SettingsValueObjectsTest {

    private static final TierLabels LABELS = new TierLabels("S", "A", "B", "C", "D", "TODO");

    @Test
    void appearanceNeedsAllThree() {
        assertThatNullPointerException().isThrownBy(() -> new Appearance(null, Accent.BLUE, TierPalette.VIVID)).withMessage("theme");
        assertThatNullPointerException().isThrownBy(() -> new Appearance(Theme.TOKYO, null, TierPalette.VIVID)).withMessage("accent");
        assertThatNullPointerException().isThrownBy(() -> new Appearance(Theme.TOKYO, Accent.BLUE, null)).withMessage("tierPalette");
    }

    @Test
    void prefsNeedADuelStrategy() {
        assertThatNullPointerException().isThrownBy(() -> new Prefs(null)).withMessage("duelStrategy");
    }

    @Test
    void everyTierNeedsAName() {
        assertThatNullPointerException().isThrownBy(() -> new TierLabels(null, "A", "B", "C", "D", "TODO")).withMessage("s");
        assertThatNullPointerException().isThrownBy(() -> new TierLabels("S", null, "B", "C", "D", "TODO")).withMessage("a");
        assertThatNullPointerException().isThrownBy(() -> new TierLabels("S", "A", null, "C", "D", "TODO")).withMessage("b");
        assertThatNullPointerException().isThrownBy(() -> new TierLabels("S", "A", "B", null, "D", "TODO")).withMessage("c");
        assertThatNullPointerException().isThrownBy(() -> new TierLabels("S", "A", "B", "C", null, "TODO")).withMessage("d");
        assertThatNullPointerException().isThrownBy(() -> new TierLabels("S", "A", "B", "C", "D", null)).withMessage("todo");
    }

    @Test
    void namingNeedsTemplateAndNamesAndReadsNoShownNamesAsNone() {
        assertThatNullPointerException().isThrownBy(() -> new Naming(null, LABELS, null, null, null)).withMessage("template");
        assertThatNullPointerException().isThrownBy(() -> new Naming("{category} {tier}", null, null, null, null)).withMessage("tierLabels");

        // Hibernate reads an all-NULL embeddable back as null.
        assertThat(new Naming("{category} {tier}", LABELS, null, null, null).tierDisplayNames()).isSameAs(TierDisplayNames.NONE);
        TierDisplayNames shown = new TierDisplayNames(null, null, null, null, null, "TODO");
        assertThat(new Naming("{category} {tier}", LABELS, shown, null, null).tierDisplayNames()).isSameAs(shown);
        assertThat(TierDisplayNames.NONE).isEqualTo(new TierDisplayNames(null, null, null, null, null, null));
    }

    @Test
    void aSettingsRowReplacesEverythingAndHandsOutACopyOfItsLinks() {
        Naming naming = new Naming("{category} {tier}", LABELS, null, null, null);
        UserSettings row = new UserSettings("alice", new Appearance(Theme.TOKYO, Accent.BLUE, TierPalette.VIVID), naming,
            Map.of("PL1", "Rap"), new Prefs(DuelStrategy.TIER_AWARE_MERGE));

        assertThat(row.getUserId()).isEqualTo("alice");
        assertThat(row.getVersion()).isZero(); // never saved: no version yet
        assertThat(row.getTodoLinks()).containsExactly(Map.entry("PL1", "Rap"));

        Map<String, String> newLinks = new HashMap<>(Map.of("PL2", "Jazz"));
        Naming newNaming = new Naming("[{tag}] {category} {tier}", LABELS, null, null, null);
        row.replace(new Appearance(Theme.PAPER, Accent.RED, TierPalette.HEAT), newNaming, newLinks, new Prefs(DuelStrategy.ELO));

        assertThat(row.getAppearance()).isEqualTo(new Appearance(Theme.PAPER, Accent.RED, TierPalette.HEAT));
        assertThat(row.getNaming()).isEqualTo(newNaming);
        assertThat(row.getTodoLinks()).containsExactly(Map.entry("PL2", "Jazz")); // the old link is gone
        assertThat(row.getPrefs()).isEqualTo(new Prefs(DuelStrategy.ELO));

        newLinks.put("PL3", "Pop"); // the row keeps its own copy
        assertThat(row.getTodoLinks()).containsOnlyKeys("PL2");
    }
}
