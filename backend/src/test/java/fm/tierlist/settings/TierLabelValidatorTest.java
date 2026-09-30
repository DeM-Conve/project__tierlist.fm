package fm.tierlist.settings;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
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

    @ParameterizedTest
    @ValueSource(strings = {"\tS", "S\n", "\u2003S"})
    void rejectsAnySurroundingWhitespaceNotJustSpaces(String label) {
        assertThat(validator.isValid(label, null)).isFalse();
    }

    @Test
    void atMost20CharactersAndNullIsLeftToNotNull() {
        assertThat(validator.isValid("a".repeat(TierLabel.MAX_LENGTH), null)).isTrue();
        assertThat(validator.isValid("a".repeat(TierLabel.MAX_LENGTH + 1), null)).isFalse();
        assertThat(validator.isValid(null, null)).isTrue();
    }

    // What two names are compared by (naming.js normalizeName): case, accents
    // and symbols fold away, the words stay.
    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "S|s",
        "(**TODO**)|todo",
        "(**To do**)|to do",
        "to-do|to do",
        "'  Gold  Star '|gold star",
        "\u00c0 faire|a faire",
        "T1|t1",
        "A+|a",
        "\uff33|s",
    })
    void wordsFoldCaseAccentsAndSymbols(String label, String words) {
        assertThat(TierLabelValidator.words(label.translateEscapes())).isEqualTo(words);
    }
}
