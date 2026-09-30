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

    @ParameterizedTest
    @ValueSource(strings = {"{Category} {tier}", "{category} {TIER}", "{ category} {tier}", "{category } {tier}"})
    void theTwoProductTokensAreExactAndCaseSensitive(String template) {
        // "{Category}" is a token of the user's own, so {category} is missing.
        assertThat(validator.isValid(template, null)).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"{category}{tier}", "{tier}{category}", "{category} {tier} {a}", "{category} {tier} {my_label}",
        "{category} {tier} {Tag2}", "{category} {tier} {abcdefghijklmnopqrst}", "{category} {tier} {Category}",
        "Été {category} {tier} ★", "{category}/{tier}%_"})
    void ownTokensAreOneWordUpTo20CharsAndAnyOtherTextIsFree(String template) {
        assertThat(validator.isValid(template, null)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"{category} {tier} {abcdefghijklmnopqrstu}", "{category} {tier} {_x}", "{category} {tier} {x-y}",
        "{category} {tier} {été}", "{{category}} {tier}", "{category} {tier} {", "{category} {tier} {{x}",
        "{category} {tier} {x}}", "{category} {tier} {x} {x}", "{category}{category} {tier}"})
    void rejectsOverlongOrNonWordTokensDoubledBracesAndRepeats(String template) {
        assertThat(validator.isValid(template, null)).isFalse();
    }

    @Test
    void atMost200Characters() {
        String base = "{category} {tier} ";
        assertThat(validator.isValid(base + "x".repeat(NamingTemplate.MAX_LENGTH - base.length()), null)).isTrue();
        assertThat(validator.isValid(base + "x".repeat(NamingTemplate.MAX_LENGTH - base.length() + 1), null)).isFalse();
    }
}
