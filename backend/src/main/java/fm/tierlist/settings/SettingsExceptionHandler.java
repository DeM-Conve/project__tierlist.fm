package fm.tierlist.settings;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

// A write that lost a race with a concurrent one (stale @Version on update, or
// a duplicate primary key when two first-ever saves insert at once) is the
// same situation as a failed If-Match: answer 412 so the client re-syncs.
// Scoped to this controller: validation stops every other integrity
// violation before the database, so here it can only mean the insert race.
@RestControllerAdvice(assignableTypes = SettingsController.class)
class SettingsExceptionHandler {

    @ExceptionHandler({OptimisticLockingFailureException.class, DataIntegrityViolationException.class})
    ProblemDetail lostRace() {
        return new SettingsConflictException().getBody();
    }
}
