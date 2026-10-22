package fm.tierlist.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpStatusCodeException;

// What a failed YouTube Data API call means, in one place: YouTube's own
// status / reason / message, the status the app answers with, and a
// plain-language sentence for the user. Used by YoutubeErrorHandler (a whole
// request failed) and by the batch writes' per-item results (one item failed).
record YoutubeError(int youtubeStatus, String reason, String message, HttpStatus status, String detail) {

    private static final ObjectMapper JSON = new ObjectMapper();

    static YoutubeError of(HttpStatusCodeException e) {
        String reason = null;
        String message = null;
        try {
            JsonNode error = JSON.readTree(e.getResponseBodyAsString()).path("error");
            reason = error.path("errors").path(0).path("reason").asText(null);
            message = error.path("message").asText(null);
        } catch (Exception ignored) {
            // not JSON - fall back to the status alone
        }
        int youtubeStatus = e.getStatusCode().value();
        HttpStatus status = switch (reason == null ? "" : reason) {
            case "quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded" -> HttpStatus.TOO_MANY_REQUESTS;
            case "videoNotFound", "playlistNotFound", "playlistItemNotFound" -> HttpStatus.NOT_FOUND;
            // Logged in, but the YouTube box on Google's consent screen was left unticked.
            case "insufficientPermissions" -> HttpStatus.FORBIDDEN;
            default -> youtubeStatus == 401 ? HttpStatus.UNAUTHORIZED : HttpStatus.BAD_GATEWAY;
        };
        String detail = switch (status) {
            case TOO_MANY_REQUESTS -> "YouTube's daily API quota for this app is used up - it resets at midnight Pacific time.";
            case UNAUTHORIZED -> "Your YouTube login expired - log out and back in.";
            case NOT_FOUND -> "YouTube says that doesn't exist (or it's private).";
            case FORBIDDEN -> "This app wasn't given access to your YouTube account - log in again and tick the YouTube permission on Google's screen.";
            default -> "YouTube refused the request" + (message != null ? ": " + message : ".");
        };
        return new YoutubeError(youtubeStatus, reason, message, status, detail);
    }
}
