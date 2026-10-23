package fm.tierlist.settings;

import org.springframework.core.NestedExceptionUtils;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.sql.SQLException;

// A write that lost a race with a concurrent one (stale @Version on update, or
// a duplicate primary key when two first-ever saves insert at once) is the
// same situation as a failed If-Match: answer 412 so the client re-syncs.
// Any other integrity violation (a CHECK the validation let through) is the
// body's fault, not a race: 400 - a 412 there sent the frontend round a
// refetch / rebase / retry loop that could never succeed.
@RestControllerAdvice(assignableTypes = SettingsController.class)
class SettingsExceptionHandler {

    // Postgres' unique_violation: the primary key, i.e. the insert race.
    static final String UNIQUE_VIOLATION = "23505";

    @ExceptionHandler(OptimisticLockingFailureException.class)
    ProblemDetail lostRace() {
        return new SettingsConflictException().getBody();
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail refusedByDatabase(DataIntegrityViolationException e) {
        Throwable cause = NestedExceptionUtils.getMostSpecificCause(e);
        if (cause instanceof SQLException sql && UNIQUE_VIOLATION.equals(sql.getSQLState())) return lostRace();
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
            "These settings break a rule the database checks (a tier name it can't use?) - change them and save again.");
        problem.setTitle("Invalid settings");
        return problem;
    }
}
