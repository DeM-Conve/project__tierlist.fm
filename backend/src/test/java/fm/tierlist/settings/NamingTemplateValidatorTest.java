package fm.tierlist.settings;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class NamingTemplateValidatorTest {

    private final NamingTemplateValidator validator = new NamingTemplateValidator();

    @ParameterizedTest
    @ValueSource(strings = {"{category} {tier}", "[{tag}] {category} {tier}", "{tier} | {category}", "{tag}: {category} {tier}-playlist",
        "{category} {tier} {year}", "[{tag}] {category} {tier} ({mood})"})
    void acceptsBuiltInAndOwnTokens(String template) {
        assertThat(validator.isValid(template, null)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "  ", "{category}", "{tier}", "{category} {tier} {tier}", "[{tag}{tag}] {category} {tier}",
        "{category} {tier} {two words}", "{category} {tier} {1st}", "{category} {tier} }", "{category} {tier} {}"})
    void rejectsMissingDuplicateMalformedTokensAndStrayBraces(String template) {
        assertThat(validator.isValid(template, null)).isFalse();
    }

    @Test
    void nullIsLeftToNotNull() {
        assertThat(validator.isValid(null, null)).isTrue();
    }
}
