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

    @Test
    void anInsertRaceIsA412ButAnyOtherDatabaseRefusalIsA400() {
        SettingsExceptionHandler handler = new SettingsExceptionHandler();
        var duplicateKey = new org.springframework.dao.DataIntegrityViolationException("dup",
            new java.sql.SQLException("duplicate key value violates unique constraint \"user_settings_pkey\"", "23505"));
        var failedCheck = new org.springframework.dao.DataIntegrityViolationException("check",
            new java.sql.SQLException("new row violates check constraint \"naming_tier_labels_valid\"", "23514"));

        assertThat(handler.refusedByDatabase(duplicateKey).getStatus()).isEqualTo(412);
        ProblemDetail refused = handler.refusedByDatabase(failedCheck);
        assertThat(refused.getStatus()).isEqualTo(400);
        assertThat(refused.getDetail()).contains("change them");
    }
}
