package fm.tierlist.settings;

import org.junit.jupiter.api.Test;
import org.springframework.http.ProblemDetail;

import static org.assertj.core.api.Assertions.assertThat;

class SettingsErrorsTest {

    @Test
    void aConflictIsA412ProblemTellingTheClientToReload() {
        SettingsConflictException e = new SettingsConflictException();

        assertThat(e.getStatusCode().value()).isEqualTo(412);
        assertThat(e.getBody().getTitle()).isEqualTo("Settings changed elsewhere");
        assertThat(e.getBody().getDetail()).contains("reload and retry");
    }

    @Test
    void aLostRaceIsAnsweredLikeAFailedIfMatch() {
        ProblemDetail problem = new SettingsExceptionHandler().lostRace();

        assertThat(problem.getStatus()).isEqualTo(412);
        assertThat(problem.getTitle()).isEqualTo("Settings changed elsewhere");
    }
}
