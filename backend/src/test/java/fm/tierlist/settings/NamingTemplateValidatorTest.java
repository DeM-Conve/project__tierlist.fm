package fm.tierlist.settings;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class NamingTemplateValidatorTest {

    private final NamingTemplateValidator validator = new NamingTemplateValidator();

    @ParameterizedTest
    @ValueSource(strings = {"{category} {tier}", "[{tag}] {category} {tier}", "{tier} | {category}", "{tag}: {category} {tier}-playlist"})
    void acceptsTheFrontendsGrammar(String template) {
        assertThat(validator.isValid(template, null)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "  ", "{category}", "{tier}", "{category} {tier} {tier}", "[{tag}{tag}] {category} {tier}",
        "{bracket} {category} {tier}", "{category} {tier} {year}"})
    void rejectsMissingDuplicateOrUnknownTokens(String template) {
        assertThat(validator.isValid(template, null)).isFalse();
    }

    @Test
    void nullIsLeftToNotNull() {
        assertThat(validator.isValid(null, null)).isTrue();
    }
}
