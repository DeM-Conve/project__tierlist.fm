package fm.tierlist.settings;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class TodoKeywordValidatorTest {

    private final TodoKeywordValidator validator = new TodoKeywordValidator();

    @ParameterizedTest
    @ValueSource(strings = {"TODO", "todo", "To do", "Inbox", "À faire", "Later2"})
    void acceptsWordsOfLettersAndDigits(String keyword) {
        assertThat(validator.isValid(keyword, null)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " TODO", "TODO ", "to  do", "to-do", "T1", "te", "TZ", "abcdefghijklmnopqrstu"})
    void rejectsPunctuationTierCodesAndOverlongKeywords(String keyword) {
        assertThat(validator.isValid(keyword, null)).isFalse();
    }
}
