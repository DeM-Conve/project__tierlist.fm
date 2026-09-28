package fm.tierlist.settings;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class TierLabelValidatorTest {

    private final TierLabelValidator validator = new TierLabelValidator();

    @ParameterizedTest
    @ValueSource(strings = {"S", "T1", "TE", "Gold", "5 stars", "À faire", "(**TODO**)", "[TODO]", "to-do", "A+"})
    void acceptsNamesAsTyped(String label) {
        assertThat(validator.isValid(label, null)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " S", "S ", "(**)", "+", "{tier}", "a}", "abcdefghijklmnopqrstu"})
    void rejectsBlankSymbolOnlyBracedAndOverlongNames(String label) {
        assertThat(validator.isValid(label, null)).isFalse();
    }
}
