package fm.tierlist.controller;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.HttpStatusCodeException;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class YoutubeErrorHandlerTest {

    private final YoutubeErrorHandler handler = new YoutubeErrorHandler();

    private static HttpStatusCodeException youtube(int status, String body) {
        HttpStatus code = HttpStatus.valueOf(status);
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        return code.is4xxClientError()
            ? HttpClientErrorException.create(code, code.getReasonPhrase(), new HttpHeaders(), bytes, StandardCharsets.UTF_8)
            : HttpServerErrorException.create(code, code.getReasonPhrase(), new HttpHeaders(), bytes, StandardCharsets.UTF_8);
    }

    private static String error(int code, String reason, String message) {
        return """
            {"error": {"code": %d, "message": "%s", "errors": [{"domain": "youtube.quota", "reason": "%s", "message": "%s"}]}}"""
            .formatted(code, message, reason, message);
    }

    @ParameterizedTest
    @CsvSource({
        "403, quotaExceeded",
        "403, dailyLimitExceeded",
        "403, rateLimitExceeded",
        "429, rateLimitExceeded",
    })
    void usedUpQuotaIs429(int youtubeStatus, String reason) {
        ProblemDetail problem = handler.youtubeFailed(youtube(youtubeStatus, error(youtubeStatus, reason, "quota")));

        assertThat(problem.getStatus()).isEqualTo(429);
        assertThat(problem.getDetail()).contains("quota").contains("resets at midnight Pacific");
        assertThat(problem.getProperties()).containsEntry("youtubeReason", reason);
    }

    @ParameterizedTest
    @CsvSource({"videoNotFound", "playlistNotFound", "playlistItemNotFound"})
    void missingThingsAre404(String reason) {
        ProblemDetail problem = handler.youtubeFailed(youtube(404, error(404, reason, "not found")));

        assertThat(problem.getStatus()).isEqualTo(404);
        assertThat(problem.getDetail()).isEqualTo("YouTube says that doesn't exist (or it's private).");
        assertThat(problem.getProperties()).containsEntry("youtubeReason", reason);
    }

    @Test
    void theYoutubeBoxLeftUntickedIs403WithHowToFixIt() {
        ProblemDetail problem = handler.youtubeFailed(youtube(403, error(403, "insufficientPermissions", "Insufficient Permission")));

        assertThat(problem.getStatus()).isEqualTo(403);
        assertThat(problem.getDetail()).contains("log in again and tick the YouTube permission");
        assertThat(problem.getProperties()).containsEntry("youtubeReason", "insufficientPermissions");
    }

    @Test
    void anExpiredLoginIs401WhateverTheReason() {
        ProblemDetail withReason = handler.youtubeFailed(youtube(401, error(401, "authError", "Invalid Credentials")));
        ProblemDetail notJson = handler.youtubeFailed(youtube(401, "Unauthorized"));

        assertThat(withReason.getStatus()).isEqualTo(401);
        assertThat(withReason.getDetail()).isEqualTo("Your YouTube login expired - log out and back in.");
        assertThat(notJson.getStatus()).isEqualTo(401);
        assertThat(notJson.getProperties()).containsEntry("youtubeReason", null);
    }

    @Test
    void anythingElseIs502CarryingYoutubesOwnMessage() {
        ProblemDetail problem = handler.youtubeFailed(youtube(400, error(400, "invalidValue", "Invalid value for playlistId")));

        assertThat(problem.getStatus()).isEqualTo(502);
        assertThat(problem.getDetail()).isEqualTo("YouTube refused the request: Invalid value for playlistId");
        assertThat(problem.getProperties()).containsEntry("youtubeReason", "invalidValue");
    }

    @Test
    void aServerErrorWithoutAJsonBodyIs502WithAPlainSentence() {
        ProblemDetail empty = handler.youtubeFailed(youtube(503, ""));
        ProblemDetail html = handler.youtubeFailed(youtube(500, "<html>oops</html>"));
        ProblemDetail noErrorObject = handler.youtubeFailed(youtube(500, "{\"something\": 1}"));

        for (ProblemDetail problem : new ProblemDetail[] {empty, html, noErrorObject}) {
            assertThat(problem.getStatus()).isEqualTo(502);
            assertThat(problem.getDetail()).isEqualTo("YouTube refused the request.");
            assertThat(problem.getProperties()).containsEntry("youtubeReason", null);
        }
    }

    @Test
    void anUnknownReasonOnA403IsNotMistakenForMissingPermission() {
        ProblemDetail problem = handler.youtubeFailed(youtube(403, error(403, "forbidden", "Forbidden")));

        assertThat(problem.getStatus()).isEqualTo(502);
        assertThat(problem.getDetail()).isEqualTo("YouTube refused the request: Forbidden");
    }
}
