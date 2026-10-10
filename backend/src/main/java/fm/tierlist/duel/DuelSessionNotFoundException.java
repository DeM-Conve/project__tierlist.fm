package fm.tierlist.duel;

import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;

// 404: no such session on this board for this user.
class DuelSessionNotFoundException extends ErrorResponseException {
    DuelSessionNotFoundException() {
        super(HttpStatus.NOT_FOUND);
        getBody().setTitle("Duel session not found");
        getBody().setDetail("That duel session doesn't exist on this board.");
    }
}
