package fm.tierlist.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.HttpStatusCodeException;

// A YouTube Data API call that failed (quota used up, login expired, video
// gone, ...) comes back as an RFC 9457 ProblemDetail carrying YouTube's own
// reason, instead of a bare 500 - so the UI can say what actually went wrong.
// Logged too, since the frontend is the only other place it would show up.
// The mapping itself is YoutubeError's.
@RestControllerAdvice(assignableTypes = PlaylistController.class)
class YoutubeErrorHandler {

    private static final Logger log = LoggerFactory.getLogger(YoutubeErrorHandler.class);

    @ExceptionHandler(HttpStatusCodeException.class)
    ProblemDetail youtubeFailed(HttpStatusCodeException e) {
        YoutubeError error = YoutubeError.of(e);
        log.warn("YouTube API {} ({}): {}", error.youtubeStatus(), error.reason(), error.message());
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(error.status(), error.detail());
        problem.setProperty("youtubeReason", error.reason());
        return problem;
    }
}
