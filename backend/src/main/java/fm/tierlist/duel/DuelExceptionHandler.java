package fm.tierlist.duel;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

// A request the frontend would never send (bad video id, a song not on the
// board, a pinned song missing) is a 400 with the reason.
@RestControllerAdvice(assignableTypes = DuelController.class)
class DuelExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail badRequest(IllegalArgumentException e) {
        ProblemDetail p = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
        p.setTitle("Invalid duel request");
        return p;
    }
}
