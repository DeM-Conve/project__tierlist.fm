package fm.tierlist.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.oauth2.client.ClientAuthorizationRequiredException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;

// A YouTube Data API call that failed (quota used up, login expired, video
// gone, ...) comes back as an RFC 9457 ProblemDetail carrying YouTube's own
// reason, instead of a bare 500 - so the UI can say what actually went wrong.
// Logged too, since the frontend is the only other place it would show up.
// The mapping itself is YoutubeError's.
// First in line: Boot's ProblemDetail handler would otherwise claim a
// RestClientException by its cause (an HttpMessageNotReadableException from
// reading YouTube's answer), then rethrow it - a bare 500.
@Order(Ordered.HIGHEST_PRECEDENCE)
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

    // Signed in, but the session holds no YouTube authorization (Google
    // refused to renew it, say). Left alone, Spring Security turns this into
    // a 302 to Google's consent page, which an API call can't follow - so it
    // is the same 401 as an expired YouTube login.
    @ExceptionHandler(ClientAuthorizationRequiredException.class)
    ProblemDetail youtubeAuthorizationMissing(ClientAuthorizationRequiredException e) {
        log.warn("YouTube call without an authorized client ({}): asking the user to log in again", e.getClientRegistrationId());
        return ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, YoutubeError.LOGIN_EXPIRED);
    }

    // No answer at all (connection refused, timeout, DNS), or one the app
    // couldn't read: still a 502 that says so, never a bare 500.
    @ExceptionHandler(RestClientException.class)
    ProblemDetail youtubeUnreachable(RestClientException e) {
        log.warn("YouTube API call failed without a usable answer: {}", e.toString());
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY, YoutubeError.noAnswer(e));
    }
}
