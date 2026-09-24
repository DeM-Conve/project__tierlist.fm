package fm.tierlist.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.HttpStatusCodeException;

// A YouTube Data API call that failed (quota used up, login expired, video
// gone, ...) comes back as an RFC 9457 ProblemDetail carrying YouTube's own
// reason, instead of a bare 500 - so the UI can say what actually went wrong.
// Logged too, since the frontend is the only other place it would show up.
@RestControllerAdvice(assignableTypes = PlaylistController.class)
class YoutubeErrorHandler {

    private static final Logger log = LoggerFactory.getLogger(YoutubeErrorHandler.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    @ExceptionHandler(HttpStatusCodeException.class)
    ProblemDetail youtubeFailed(HttpStatusCodeException e) {
        String reason = null;
        String message = null;
        try {
            JsonNode error = JSON.readTree(e.getResponseBodyAsString()).path("error");
            reason = error.path("errors").path(0).path("reason").asText(null);
            message = error.path("message").asText(null);
        } catch (Exception ignored) {
            // not JSON - fall back to the status alone
        }
        log.warn("YouTube API {} ({}): {}", e.getStatusCode().value(), reason, message);

        HttpStatus status = switch (reason == null ? "" : reason) {
            case "quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded" -> HttpStatus.TOO_MANY_REQUESTS;
            case "videoNotFound", "playlistNotFound", "playlistItemNotFound" -> HttpStatus.NOT_FOUND;
            // Logged in, but the YouTube box on Google's consent screen was left unticked.
            case "insufficientPermissions" -> HttpStatus.FORBIDDEN;
            default -> e.getStatusCode().value() == 401 ? HttpStatus.UNAUTHORIZED : HttpStatus.BAD_GATEWAY;
        };
        String detail = switch (status) {
            case TOO_MANY_REQUESTS -> "YouTube's daily API quota for this app is used up - it resets at midnight Pacific time.";
            case UNAUTHORIZED -> "Your YouTube login expired - log out and back in.";
            case NOT_FOUND -> "YouTube says that doesn't exist (or it's private).";
            case FORBIDDEN -> "This app wasn't given access to your YouTube account - log in again and tick the YouTube permission on Google's screen.";
            default -> "YouTube refused the request" + (message != null ? ": " + message : ".");
        };
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setProperty("youtubeReason", reason);
        return problem;
    }
}
