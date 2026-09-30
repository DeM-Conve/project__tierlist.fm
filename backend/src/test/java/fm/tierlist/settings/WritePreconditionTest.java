package fm.tierlist.settings;

import fm.tierlist.settings.WritePrecondition.MustMatch;
import fm.tierlist.settings.WritePrecondition.MustNotExist;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.ErrorResponseException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WritePreconditionTest {

    private static int statusOf(Runnable call) {
        try {
            call.run();
        } catch (ErrorResponseException e) {
            return e.getStatusCode().value();
        }
        throw new AssertionError("no ErrorResponseException");
    }

    @Test
    void ifMatchWithOneStrongNumericTagIsMustMatch() {
        assertThat(WritePrecondition.fromHeaders("\"0\"", null)).isEqualTo(new MustMatch(0));
        assertThat(WritePrecondition.fromHeaders("\"42\"", null)).isEqualTo(new MustMatch(42));
    }

    @Test
    void ifMatchWinsOverIfNoneMatch() {
        assertThat(WritePrecondition.fromHeaders("\"3\"", "*")).isEqualTo(new MustMatch(3));
    }

    @ParameterizedTest
    @ValueSource(strings = {"*", "W/\"1\"", "\"abc\"", "\"1\", \"2\"", "\"\"", "\"1.5\""})
    void anIfMatchThatIsNotOneOfOurETagsIs412(String ifMatch) {
        assertThat(statusOf(() -> WritePrecondition.fromHeaders(ifMatch, null))).isEqualTo(412);
    }

    @Test
    void ifNoneMatchWildcardIsMustNotExist() {
        assertThat(WritePrecondition.fromHeaders(null, "*")).isInstanceOf(MustNotExist.class);
        assertThat(WritePrecondition.fromHeaders(null, "\"7\", *")).isInstanceOf(MustNotExist.class);
    }

    @Test
    void noPreconditionOrANonWildcardIfNoneMatchIs428() {
        assertThat(statusOf(() -> WritePrecondition.fromHeaders(null, null))).isEqualTo(428);
        assertThat(statusOf(() -> WritePrecondition.fromHeaders(null, "\"0\""))).isEqualTo(428);
        assertThatThrownBy(() -> WritePrecondition.fromHeaders(null, "")).isInstanceOf(ErrorResponseException.class);
    }

    @Test
    void mustNotExistHoldsOnlyWithoutARow() {
        assertThat(new MustNotExist().isSatisfiedBy(Optional.empty())).isTrue();
        assertThat(new MustNotExist().isSatisfiedBy(Optional.of(0L))).isFalse();
    }

    @Test
    void mustMatchHoldsOnlyForThatVersion() {
        assertThat(new MustMatch(2).isSatisfiedBy(Optional.of(2L))).isTrue();
        assertThat(new MustMatch(2).isSatisfiedBy(Optional.of(3L))).isFalse();
        assertThat(new MustMatch(2).isSatisfiedBy(Optional.of(1L))).isFalse();
        assertThat(new MustMatch(0).isSatisfiedBy(Optional.empty())).isFalse();
    }
}
