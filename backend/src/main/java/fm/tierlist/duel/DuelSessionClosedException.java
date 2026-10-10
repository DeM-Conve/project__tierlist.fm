package fm.tierlist.duel;

import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;

// 409: the session ended (time's up or End session) - start another one.
class DuelSessionClosedException extends ErrorResponseException {
    DuelSessionClosedException() {
        super(HttpStatus.CONFLICT);
        getBody().setTitle("Duel session ended");
        getBody().setDetail("This session has ended. Start another one to keep duelling.");
    }
}
