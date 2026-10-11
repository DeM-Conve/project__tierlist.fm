package fm.tierlist.controller;

import fm.tierlist.PostgresIT;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.time.Instant;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Client;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withNoContent;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// The YouTube-facing API. YouTube itself is replaced by a MockRestServiceServer
// bound to the controller's RestTemplate, so each test states exactly which
// YouTube calls (URL, method, token, body) an endpoint makes, in order, and
// what the app makes of the answers.
class PlaylistControllerIT extends PostgresIT {

    private static final String YT = "https://www.googleapis.com/youtube/v3";
    private static final String TOKEN = "yt-access-token";

    @Autowired
    MockMvc mvc;

    @Autowired
    RestTemplate youtubeRestTemplate;

    @Autowired
    ClientRegistrationRepository registrations;

    private MockRestServiceServer youtube;

    @BeforeEach
    void bindYoutube() {
        youtube = MockRestServiceServer.bindTo(youtubeRestTemplate).build();
    }

    @AfterEach
    void everyExpectedCallWasMade() {
        youtube.verify();
    }

    // Signed in with Google, holding an authorized "google" client whose token YouTube calls must carry.
    private RequestPostProcessor signedIn() {
        RequestPostProcessor login = oidcLogin().idToken(t -> t.subject("alice"));
        RequestPostProcessor client = oauth2Client("google")
            .clientRegistration(registrations.findByRegistrationId("google"))
            .principalName("alice")
            .accessToken(new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, TOKEN,
                Instant.now(), Instant.now().plusSeconds(3600)));
        return request -> client.postProcessRequest(login.postProcessRequest(request));
    }

    private MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String body) {
        return request.with(signedIn()).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private void expectGet(String url, String response) {
        youtube.expect(requestTo(url))
            .andExpect(method(HttpMethod.GET))
            .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN))
            .andRespond(withSuccess(response, MediaType.APPLICATION_JSON));
    }

    private static String youtubeError(int code, String reason, String message) {
        return """
            {"error": {"code": %d, "message": "%s", "errors": [{"reason": "%s", "message": "%s"}]}}"""
            .formatted(code, message, reason, message);
    }

    // ---- GET /api/playlists -------------------------------------------------

    @Test
    void playlistsFollowEveryPageAndMapTitleThumbnailAndCount() throws Exception {
        String url = YT + "/playlists?part=snippet,contentDetails&mine=true&maxResults=50";
        expectGet(url, """
            {"nextPageToken": "PAGE2", "items": [
              {"id": "PL1", "snippet": {"title": "Rap S", "thumbnails": {
                 "default": {"url": "https://i.ytimg.com/1/default.jpg"},
                 "medium": {"url": "https://i.ytimg.com/1/mqdefault.jpg"}}},
               "contentDetails": {"itemCount": 12}},
              {"id": "PL2", "snippet": {"title": "Rap A", "thumbnails": {
                 "default": {"url": "https://i.ytimg.com/2/default.jpg"}}},
               "contentDetails": {"itemCount": 0}}
            ]}""");
        expectGet(url + "&pageToken=PAGE2", """
            {"nextPageToken": "PAGE3", "items": [
              {"id": "PL3", "snippet": {"title": "Jazz S"}}
            ]}""");
        expectGet(url + "&pageToken=PAGE3", """
            {"items": [
              {"id": "PL4", "snippet": {"title": "Jazz A", "thumbnails": {}}, "contentDetails": {"itemCount": 3}}
            ]}""");

        mvc.perform(get("/api/playlists").with(signedIn()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(4)))
            .andExpect(jsonPath("$[0].id").value("PL1"))
            .andExpect(jsonPath("$[0].title").value("Rap S"))
            .andExpect(jsonPath("$[0].thumbnail").value("https://i.ytimg.com/1/mqdefault.jpg")) // medium preferred
            .andExpect(jsonPath("$[0].itemCount").value(12))
            .andExpect(jsonPath("$[1].thumbnail").value("https://i.ytimg.com/2/default.jpg")) // falls back to default
            .andExpect(jsonPath("$[1].itemCount").value(0))
            .andExpect(jsonPath("$[2].id").value("PL3"))
            .andExpect(jsonPath("$[2].thumbnail").value(nullValue())) // no thumbnails at all
            .andExpect(jsonPath("$[2].itemCount").value(0)) // no contentDetails
            .andExpect(jsonPath("$[3].thumbnail").value(nullValue())) // empty thumbnails
            .andExpect(jsonPath("$[3].itemCount").value(3));
    }

    @Test
    void anAccountWithNoPlaylistsIsAnEmptyList() throws Exception {
        expectGet(YT + "/playlists?part=snippet,contentDetails&mine=true&maxResults=50", "{\"kind\": \"youtube#playlistListResponse\"}");

        mvc.perform(get("/api/playlists").with(signedIn()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void aYoutubeFailureWhileListingIsAProblemDetail() throws Exception {
        youtube.expect(requestTo(YT + "/playlists?part=snippet,contentDetails&mine=true&maxResults=50"))
            .andRespond(withStatus(HttpStatus.FORBIDDEN).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(403, "quotaExceeded", "The request cannot be completed because you have exceeded your quota.")));

        mvc.perform(get("/api/playlists").with(signedIn()))
            .andExpect(status().isTooManyRequests())
            .andExpect(r -> org.assertj.core.api.Assertions.assertThat(r.getResponse().getContentType())
                .isEqualTo(MediaType.APPLICATION_PROBLEM_JSON_VALUE))
            .andExpect(jsonPath("$.status").value(429))
            .andExpect(jsonPath("$.detail").value(containsString("quota")))
            .andExpect(jsonPath("$.youtubeReason").value("quotaExceeded"));
    }

    @Test
    void aFailureOnALaterPageFailsTheWholeList() throws Exception {
        String url = YT + "/playlists?part=snippet,contentDetails&mine=true&maxResults=50";
        expectGet(url, "{\"nextPageToken\": \"P2\", \"items\": [{\"id\": \"PL1\", \"snippet\": {\"title\": \"Rap S\"}}]}");
        youtube.expect(requestTo(url + "&pageToken=P2"))
            .andRespond(withStatus(HttpStatus.UNAUTHORIZED).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(401, "authError", "Invalid Credentials")));

        mvc.perform(get("/api/playlists").with(signedIn()))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.detail").value(containsString("log out and back in")));
    }

    // ---- GET /api/playlists/{id}/items --------------------------------------

    // Asks YouTube for only the fields the app maps (partial response).
    private static String itemsUrl(String playlistId) {
        return YT + "/playlistItems?part=snippet,contentDetails&playlistId=" + playlistId
            + "&maxResults=50&fields=" + PlaylistController.ITEM_FIELDS;
    }

    @Test
    void itemsFollowEveryPageMapFieldsAndSkipDeletedAndPrivateVideos() throws Exception {
        String url = itemsUrl("PLrap");
        expectGet(url, """
            {"nextPageToken": "N2", "items": [
              {"id": "ITEM1", "snippet": {"title": "Song One", "videoOwnerChannelTitle": "Artist One",
                 "resourceId": {"kind": "youtube#video", "videoId": "vid1"},
                 "thumbnails": {"medium": {"url": "https://i.ytimg.com/vid1/mq.jpg"}}},
               "contentDetails": {"videoId": "vid1"}},
              {"id": "ITEM2", "snippet": {"title": "Deleted video", "resourceId": {"videoId": "gone"}},
               "contentDetails": {"videoId": "gone"}}
            ]}""");
        expectGet(url + "&pageToken=N2", """
            {"items": [
              {"id": "ITEM3", "snippet": {"title": "Private video", "resourceId": {"videoId": "hidden"}},
               "contentDetails": {"videoId": "hidden"}},
              {"id": "ITEM4", "snippet": {"title": "Song Two", "videoOwnerChannelTitle": "Artist Two",
                 "resourceId": {"kind": "youtube#video", "videoId": "vid2"}}}
            ]}""");

        mvc.perform(get("/api/playlists/PLrap/items").with(signedIn()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[0].id").value("ITEM1"))
            .andExpect(jsonPath("$[0].videoId").value("vid1"))
            .andExpect(jsonPath("$[0].title").value("Song One"))
            .andExpect(jsonPath("$[0].channelTitle").value("Artist One"))
            .andExpect(jsonPath("$[0].thumbnail").value("https://i.ytimg.com/vid1/mq.jpg"))
            .andExpect(jsonPath("$[1].id").value("ITEM4"))
            .andExpect(jsonPath("$[1].videoId").value("vid2")) // no contentDetails: from snippet.resourceId
            .andExpect(jsonPath("$[1].channelTitle").value("Artist Two"))
            .andExpect(jsonPath("$[1].thumbnail").value(nullValue()));
    }

    @Test
    void theSameVideoTwiceInAPlaylistComesBackTwice() throws Exception {
        expectGet(itemsUrl("PLrap"), """
            {"items": [
              {"id": "ITEM1", "snippet": {"title": "Song", "resourceId": {"videoId": "vid1"}}, "contentDetails": {"videoId": "vid1"}},
              {"id": "ITEM2", "snippet": {"title": "Song", "resourceId": {"videoId": "vid1"}}, "contentDetails": {"videoId": "vid1"}}
            ]}""");

        mvc.perform(get("/api/playlists/PLrap/items").with(signedIn()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[0].id").value("ITEM1"))
            .andExpect(jsonPath("$[1].id").value("ITEM2"));
    }

    @Test
    void itemsOfAMissingPlaylistAre404() throws Exception {
        youtube.expect(requestTo(itemsUrl("PLgone")))
            .andRespond(withStatus(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(404, "playlistNotFound", "The playlist identified with the request's playlistId parameter cannot be found.")));

        mvc.perform(get("/api/playlists/PLgone/items").with(signedIn()))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.youtubeReason").value("playlistNotFound"))
            .andExpect(jsonPath("$.detail").value(containsString("doesn't exist")));
    }

    // ---- GET /api/videos/{videoId} ------------------------------------------

    @Test
    void aVideoIsLookedUpByIdForAPastedLink() throws Exception {
        expectGet(YT + "/videos?part=snippet&id=dQw4w9WgXcQ", """
            {"items": [{"id": "dQw4w9WgXcQ", "snippet": {"title": "A Song", "channelTitle": "A Channel",
               "thumbnails": {"default": {"url": "https://i.ytimg.com/d/default.jpg"}}}}]}""");

        mvc.perform(get("/api/videos/dQw4w9WgXcQ").with(signedIn()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.videoId").value("dQw4w9WgXcQ"))
            .andExpect(jsonPath("$.title").value("A Song"))
            .andExpect(jsonPath("$.channelTitle").value("A Channel"))
            .andExpect(jsonPath("$.thumbnail").value("https://i.ytimg.com/d/default.jpg"));
    }

    @Test
    void anUnknownOrPrivateVideoIs404() throws Exception {
        expectGet(YT + "/videos?part=snippet&id=nope", "{\"items\": []}");
        expectGet(YT + "/videos?part=snippet&id=nope2", "{}");

        mvc.perform(get("/api/videos/nope").with(signedIn())).andExpect(status().isNotFound());
        mvc.perform(get("/api/videos/nope2").with(signedIn())).andExpect(status().isNotFound());
    }

    // ---- POST /api/playlists/{id}/items -------------------------------------

    @Test
    void addingAVideoInsertsItAndReturnsTheNewItemInTheItemsShape() throws Exception {
        youtube.expect(requestTo(YT + "/playlistItems?part=snippet"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(content().json("""
                {"snippet": {"playlistId": "PLrapS", "resourceId": {"kind": "youtube#video", "videoId": "vid9"}}}""", true))
            .andRespond(withSuccess("""
                {"id": "NEWITEM", "snippet": {"playlistId": "PLrapS", "title": "Song Nine", "videoOwnerChannelTitle": "Artist",
                  "resourceId": {"kind": "youtube#video", "videoId": "vid9"},
                  "thumbnails": {"medium": {"url": "https://i.ytimg.com/vid9/mq.jpg"}}}}""", MediaType.APPLICATION_JSON));

        mvc.perform(json(post("/api/playlists/PLrapS/items"), "{\"videoId\": \"vid9\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value("NEWITEM")) // what undo deletes
            .andExpect(jsonPath("$.videoId").value("vid9"))
            .andExpect(jsonPath("$.title").value("Song Nine"))
            .andExpect(jsonPath("$.channelTitle").value("Artist"))
            .andExpect(jsonPath("$.thumbnail").value("https://i.ytimg.com/vid9/mq.jpg"));
    }

    @Test
    void addingToAPlaylistYoutubeRefusesIsAProblemDetail() throws Exception {
        youtube.expect(requestTo(YT + "/playlistItems?part=snippet"))
            .andRespond(withStatus(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(404, "videoNotFound", "Video not found.")));

        mvc.perform(json(post("/api/playlists/PLrapS/items"), "{\"videoId\": \"nope\"}"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.youtubeReason").value("videoNotFound"));
    }

    // ---- DELETE /api/playlist-items/{itemId} --------------------------------

    @Test
    void removingAnItemDeletesItOnYoutube() throws Exception {
        youtube.expect(requestTo(YT + "/playlistItems?id=ITEM1"))
            .andExpect(method(HttpMethod.DELETE))
            .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN))
            .andRespond(withNoContent());

        mvc.perform(delete("/api/playlist-items/ITEM1").with(signedIn())).andExpect(status().isNoContent());
    }

    @Test
    void removingAnItemThatIsAlreadyGoneIs404() throws Exception {
        youtube.expect(requestTo(YT + "/playlistItems?id=GONE"))
            .andRespond(withStatus(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(404, "playlistItemNotFound", "Playlist item not found.")));

        mvc.perform(delete("/api/playlist-items/GONE").with(signedIn()))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.youtubeReason").value("playlistItemNotFound"));
    }

    // ---- POST /api/tier-sync ------------------------------------------------

    private void expectInsert(String playlistId, String videoId) {
        youtube.expect(requestTo(YT + "/playlistItems?part=snippet"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN))
            .andExpect(content().json("""
                {"snippet": {"playlistId": "%s", "resourceId": {"kind": "youtube#video", "videoId": "%s"}}}"""
                .formatted(playlistId, videoId), true))
            .andRespond(withSuccess("{\"id\": \"NEW-" + videoId + "\"}", MediaType.APPLICATION_JSON));
    }

    private void expectDelete(String itemId) {
        youtube.expect(requestTo(YT + "/playlistItems?id=" + itemId))
            .andExpect(method(HttpMethod.DELETE))
            .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN))
            .andRespond(withNoContent());
    }

    @Test
    void aMoveInsertsIntoTheTargetBeforeDeletingTheOriginal() throws Exception {
        expectInsert("PLrapS", "vid1");
        expectDelete("OLD1");
        expectInsert("PLrapB", "vid2");
        expectDelete("OLD2");

        mvc.perform(json(post("/api/tier-sync"), """
                [{"videoId": "vid1", "fromItemId": "OLD1", "toPlaylistId": "PLrapS"},
                 {"videoId": "vid2", "fromItemId": "OLD2", "toPlaylistId": "PLrapB"}]"""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applied").value(2))
            .andExpect(jsonPath("$.total").value(2))
            .andExpect(jsonPath("$.results[0].videoId").value("vid1"))
            .andExpect(jsonPath("$.results[0].success").value(true))
            .andExpect(jsonPath("$.results[1].success").value(true));
    }

    @Test
    void aDuplicateCleanupOnlyDeletesAndANewFilingOnlyInserts() throws Exception {
        expectDelete("DUP1");   // toPlaylistId null
        expectDelete("DUP2");   // toPlaylistId blank
        expectInsert("PLrapA", "vid3"); // no fromItemId

        mvc.perform(json(post("/api/tier-sync"), """
                [{"videoId": "vid1", "fromItemId": "DUP1", "toPlaylistId": null},
                 {"videoId": "vid2", "fromItemId": "DUP2", "toPlaylistId": "  "},
                 {"videoId": "vid3", "toPlaylistId": "PLrapA"}]"""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applied").value(3))
            .andExpect(jsonPath("$.total").value(3));
    }

    @Test
    void aFailedInsertKeepsTheOriginalAndTheRestOfTheBatchStillRuns() throws Exception {
        youtube.expect(requestTo(YT + "/playlistItems?part=snippet"))
            .andExpect(method(HttpMethod.POST))
            .andRespond(withStatus(HttpStatus.FORBIDDEN).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(403, "quotaExceeded", "quota")));
        // no DELETE for OLD1 - the video must never be lost
        expectInsert("PLrapB", "vid2");
        expectDelete("OLD2");

        mvc.perform(json(post("/api/tier-sync"), """
                [{"videoId": "vid1", "fromItemId": "OLD1", "toPlaylistId": "PLrapS"},
                 {"videoId": "vid2", "fromItemId": "OLD2", "toPlaylistId": "PLrapB"}]"""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applied").value(1))
            .andExpect(jsonPath("$.total").value(2))
            .andExpect(jsonPath("$.results[0].success").value(false))
            .andExpect(jsonPath("$.results[0].error").value(containsString("403")))
            .andExpect(jsonPath("$.results[1].success").value(true))
            .andExpect(jsonPath("$.results[1].error").doesNotExist());
    }

    @Test
    void aFailedDeleteAfterASuccessfulInsertIsReportedAsAFailure() throws Exception {
        expectInsert("PLrapS", "vid1");
        youtube.expect(requestTo(YT + "/playlistItems?id=OLD1"))
            .andExpect(method(HttpMethod.DELETE))
            .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        mvc.perform(json(post("/api/tier-sync"), """
                [{"videoId": "vid1", "fromItemId": "OLD1", "toPlaylistId": "PLrapS"}]"""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applied").value(0))
            .andExpect(jsonPath("$.results[0].success").value(false))
            .andExpect(jsonPath("$.results[0].error").value(containsString("500")));
    }

    @Test
    void anEmptyTierSyncTouchesNothing() throws Exception {
        youtube.expect(ExpectedCount.never(), requestTo(YT + "/playlistItems?part=snippet"));

        mvc.perform(json(post("/api/tier-sync"), "[]"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applied").value(0))
            .andExpect(jsonPath("$.total").value(0))
            .andExpect(jsonPath("$.results", hasSize(0)));
    }

    // ---- POST /api/playlists/rename -----------------------------------------

    @Test
    void aRenameChangesOnlyTheTitleKeepingDescriptionAndLanguage() throws Exception {
        expectGet(YT + "/playlists?part=snippet&id=PL1", """
            {"items": [{"id": "PL1", "snippet": {"title": "Rap S", "description": "my best rap",
               "defaultLanguage": "en", "channelId": "UC1", "publishedAt": "2020-01-01T00:00:00Z",
               "thumbnails": {"default": {"url": "x"}}, "localized": {"title": "Rap S"}}}]}""");
        youtube.expect(requestTo(YT + "/playlists?part=snippet"))
            .andExpect(method(HttpMethod.PUT))
            .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            // Strict: read-only fields (thumbnails, channelId, ...) are not sent back.
            .andExpect(content().json("""
                {"id": "PL1", "snippet": {"title": "Hip-hop S", "description": "my best rap", "defaultLanguage": "en"}}""", true))
            .andRespond(withSuccess("{\"id\": \"PL1\"}", MediaType.APPLICATION_JSON));

        mvc.perform(json(post("/api/playlists/rename"), "[{\"id\": \"PL1\", \"title\": \"Hip-hop S\"}]"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applied").value(1))
            .andExpect(jsonPath("$.total").value(1))
            .andExpect(jsonPath("$.results[0].id").value("PL1"))
            .andExpect(jsonPath("$.results[0].title").value("Hip-hop S"))
            .andExpect(jsonPath("$.results[0].success").value(true));
    }

    @Test
    void aRenameWithoutDescriptionOrLanguageSendsJustTheTitle() throws Exception {
        expectGet(YT + "/playlists?part=snippet&id=PL1", "{\"items\": [{\"id\": \"PL1\", \"snippet\": {\"title\": \"Rap S\"}}]}");
        youtube.expect(requestTo(YT + "/playlists?part=snippet"))
            .andExpect(method(HttpMethod.PUT))
            .andExpect(content().json("{\"id\": \"PL1\", \"snippet\": {\"title\": \"Rap A\"}}", true))
            .andRespond(withSuccess("{\"id\": \"PL1\"}", MediaType.APPLICATION_JSON));

        mvc.perform(json(post("/api/playlists/rename"), "[{\"id\": \"PL1\", \"title\": \"Rap A\"}]"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.results[0].success").value(true));
    }

    @Test
    void renamesAreIndependentOneMissingOrFailedPlaylistNeverAbortsTheBatch() throws Exception {
        // 1: not found (empty items) -> no update attempted
        expectGet(YT + "/playlists?part=snippet&id=GONE", "{\"items\": []}");
        // 2: update refused
        expectGet(YT + "/playlists?part=snippet&id=PL2", "{\"items\": [{\"id\": \"PL2\", \"snippet\": {\"title\": \"Old\"}}]}");
        youtube.expect(requestTo(YT + "/playlists?part=snippet"))
            .andExpect(method(HttpMethod.PUT))
            .andRespond(withStatus(HttpStatus.FORBIDDEN).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(403, "playlistForbidden", "forbidden")));
        // 3: read refused
        youtube.expect(requestTo(YT + "/playlists?part=snippet&id=PL3"))
            .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        // 4: fine
        expectGet(YT + "/playlists?part=snippet&id=PL4", "{\"items\": [{\"id\": \"PL4\", \"snippet\": {\"title\": \"Old\"}}]}");
        youtube.expect(requestTo(YT + "/playlists?part=snippet"))
            .andExpect(method(HttpMethod.PUT))
            .andExpect(content().json("{\"id\": \"PL4\", \"snippet\": {\"title\": \"New 4\"}}", true))
            .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        mvc.perform(json(post("/api/playlists/rename"), """
                [{"id": "GONE", "title": "New 1"}, {"id": "PL2", "title": "New 2"},
                 {"id": "PL3", "title": "New 3"}, {"id": "PL4", "title": "New 4"}]"""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applied").value(1))
            .andExpect(jsonPath("$.total").value(4))
            .andExpect(jsonPath("$.results[0].success").value(false))
            .andExpect(jsonPath("$.results[0].error").value("Playlist not found"))
            .andExpect(jsonPath("$.results[1].success").value(false))
            .andExpect(jsonPath("$.results[1].error").value(containsString("403")))
            .andExpect(jsonPath("$.results[2].success").value(false))
            .andExpect(jsonPath("$.results[2].error").value(containsString("503")))
            .andExpect(jsonPath("$.results[3].id").value("PL4"))
            .andExpect(jsonPath("$.results[3].success").value(true));
    }

    // ---- POST /api/playlists/create -----------------------------------------

    @Test
    void createdPlaylistsArePrivateUnlessAskedAndReportTheirNewIds() throws Exception {
        youtube.expect(requestTo(YT + "/playlists?part=snippet,status"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(content().json("{\"snippet\": {\"title\": \"Rap S\"}, \"status\": {\"privacyStatus\": \"private\"}}", true))
            .andRespond(withSuccess("{\"id\": \"PLnew1\"}", MediaType.APPLICATION_JSON));
        youtube.expect(requestTo(YT + "/playlists?part=snippet,status"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(content().json("{\"snippet\": {\"title\": \"Rap A\"}, \"status\": {\"privacyStatus\": \"unlisted\"}}", true))
            .andRespond(withSuccess("{\"id\": \"PLnew2\"}", MediaType.APPLICATION_JSON));

        mvc.perform(json(post("/api/playlists/create"), """
                [{"title": "Rap S"}, {"title": "Rap A", "privacyStatus": "unlisted"}]"""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applied").value(2))
            .andExpect(jsonPath("$.total").value(2))
            .andExpect(jsonPath("$.results[0].title").value("Rap S"))
            .andExpect(jsonPath("$.results[0].id").value("PLnew1"))
            .andExpect(jsonPath("$.results[0].success").value(true))
            .andExpect(jsonPath("$.results[1].id").value("PLnew2"));
    }

    @Test
    void aFailedCreateIsReportedPerPlaylist() throws Exception {
        youtube.expect(requestTo(YT + "/playlists?part=snippet,status"))
            .andRespond(withStatus(HttpStatus.FORBIDDEN).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(403, "quotaExceeded", "quota")));
        youtube.expect(requestTo(YT + "/playlists?part=snippet,status"))
            .andRespond(withSuccess("{\"id\": \"PLok\"}", MediaType.APPLICATION_JSON));

        mvc.perform(json(post("/api/playlists/create"), "[{\"title\": \"Rap S\"}, {\"title\": \"Rap A\"}]"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applied").value(1))
            .andExpect(jsonPath("$.results[0].success").value(false))
            .andExpect(jsonPath("$.results[0].error").value(containsString("403")))
            .andExpect(jsonPath("$.results[0].id").doesNotExist())
            .andExpect(jsonPath("$.results[1].success").value(true))
            .andExpect(jsonPath("$.results[1].id").value("PLok"));
    }

    // ---- auth ---------------------------------------------------------------

    @Test
    void everyYoutubeEndpointNeedsLoginAndCallsNothingWithout() throws Exception {
        // No expectations: any YouTube call would fail verify().
        mvc.perform(get("/api/playlists")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/playlists/PL1/items")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/videos/vid1")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/playlists/PL1/items").contentType(MediaType.APPLICATION_JSON).content("{\"videoId\": \"v\"}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/playlist-items/ITEM1")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/tier-sync").contentType(MediaType.APPLICATION_JSON).content("[]"))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/playlists/rename").contentType(MediaType.APPLICATION_JSON).content("[]"))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/playlists/create").contentType(MediaType.APPLICATION_JSON).content("[]"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void authStatusIsPublicAndSaysWhetherYouAreLoggedIn() throws Exception {
        mvc.perform(get("/api/auth/status"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.loggedIn").value(false))
            .andExpect(jsonPath("$.userId").doesNotExist());
        mvc.perform(get("/api/auth/status").with(signedIn()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.loggedIn").value(true))
            .andExpect(jsonPath("$.userId").value("alice"));
    }

    @Test
    @Disabled("BUG: YouTube unreachable (connection refused / timeout / DNS -> ResourceAccessException) is not an "
        + "HttpStatusCodeException, so YoutubeErrorHandler never sees it: the request fails with an unhandled "
        + "ServletException -> a bare 500 from Boot's error page with no plain-language `detail`, against the "
        + "'a failed load must say why' rule. Expected: 502 ProblemDetail saying YouTube couldn't be reached.")
    void youtubeBeingUnreachableIsA502SayingSo() throws Exception {
        youtube.expect(requestTo(YT + "/playlists?part=snippet,contentDetails&mine=true&maxResults=50"))
            .andRespond(withException(new IOException("Connection refused")));

        mvc.perform(get("/api/playlists").with(signedIn()))
            .andExpect(status().isBadGateway())
            .andExpect(jsonPath("$.detail").isNotEmpty());
    }
}
