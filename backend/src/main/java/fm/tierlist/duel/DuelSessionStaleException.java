package fm.tierlist.duel;

import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;

// 409: the request was made against an older state of the session (a double
// key press, another tab) - nothing was recorded; reload the session.
class DuelSessionStaleException extends ErrorResponseException {
    DuelSessionStaleException() {
        super(HttpStatus.CONFLICT);
        getBody().setTitle("Duel session changed");
        getBody().setDetail("This session moved on in the meantime - nothing was recorded twice. Showing where it is now.");
        getBody().setProperty("stale", true);
    }
}
