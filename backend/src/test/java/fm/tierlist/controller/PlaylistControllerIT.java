package fm.tierlist.controller;

import fm.tierlist.PostgresIT;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
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

import static org.assertj.core.api.Assertions.assertThat;
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
// YouTube calls (URL, method, token, body) an endpoint makes, and what the app
// makes of the answers. Expectations match in any order - batch writes run a
// few at a time (YoutubeBatch) - so two calls to one URL are told apart by
// their bodies; a test that pins down an order binds an ordered server.
@ExtendWith(OutputCaptureExtension.class)
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
        youtube = MockRestServiceServer.bindTo(youtubeRestTemplate).ignoreExpectOrder(true).build();
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
        String url = YT + "/playlists?part=snippet,contentDetails&mine=true&maxResults=50&fields=" + PlaylistController.PLAYLIST_FIELDS;
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
        expectGet(YT + "/playlists?part=snippet,contentDetails&mine=true&maxResults=50&fields=" + PlaylistController.PLAYLIST_FIELDS, "{\"kind\": \"youtube#playlistListResponse\"}");

        mvc.perform(get("/api/playlists").with(signedIn()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void aYoutubeFailureWhileListingIsAProblemDetail() throws Exception {
        youtube.expect(requestTo(YT + "/playlists?part=snippet,contentDetails&mine=true&maxResults=50&fields=" + PlaylistController.PLAYLIST_FIELDS))
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
        String url = YT + "/playlists?part=snippet,contentDetails&mine=true&maxResults=50&fields=" + PlaylistController.PLAYLIST_FIELDS;
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
        expectGet(YT + "/videos?part=snippet&id=dQw4w9WgXcQ&fields=" + PlaylistController.VIDEO_FIELDS, """
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
        expectGet(YT + "/videos?part=snippet&id=nope&fields=" + PlaylistController.VIDEO_FIELDS, "{\"items\": []}");
        expectGet(YT + "/videos?part=snippet&id=nope2&fields=" + PlaylistController.VIDEO_FIELDS, "{}");

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

    private void expectDeleteAnswering(String itemId, HttpStatus status, String reason) {
        youtube.expect(requestTo(YT + "/playlistItems?id=" + itemId))
            .andExpect(method(HttpMethod.DELETE))
            .andRespond(withStatus(status).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(status.value(), reason, reason + " message")));
    }

    private MockRestServiceServer ordered() {
        return MockRestServiceServer.bindTo(youtubeRestTemplate).build();
    }

    @Test
    void aMoveInsertsIntoTheTargetBeforeDeletingTheOriginalAndReturnsTheNewItemId() throws Exception {
        // Ordered: moves into one playlist run one after another, insert first.
        youtube = ordered();
        expectInsert("PLrapS", "vid1");
        expectDelete("OLD1");
        expectInsert("PLrapS", "vid2");
        expectDelete("OLD2");

        mvc.perform(json(post("/api/tier-sync"), """
                [{"videoId": "vid1", "fromItemId": "OLD1", "toPlaylistId": "PLrapS"},
                 {"videoId": "vid2", "fromItemId": "OLD2", "toPlaylistId": "PLrapS"}]"""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applied").value(2))
            .andExpect(jsonPath("$.total").value(2))
            .andExpect(jsonPath("$.results[0].videoId").value("vid1"))
            .andExpect(jsonPath("$.results[0].success").value(true))
            .andExpect(jsonPath("$.results[0].inserted").value(true))
            .andExpect(jsonPath("$.results[0].removed").value(true))
            // The song's item id from now on - the old one is gone.
            .andExpect(jsonPath("$.results[0].newItemId").value("NEW-vid1"))
            .andExpect(jsonPath("$.results[0].step").doesNotExist())
            .andExpect(jsonPath("$.results[0].error").doesNotExist())
            .andExpect(jsonPath("$.results[1].success").value(true))
            .andExpect(jsonPath("$.results[1].newItemId").value("NEW-vid2"));
    }

    @Test
    void rowsSharingASourceOrTargetPlaylistRunOneAfterAnother() throws Exception {
        // Row 1 moves out of PLs while row 0 moves into it: with fromPlaylistId sent,
        // row 1 waits for row 0, so the calls come strictly in this order.
        youtube = ordered();
        expectInsert("PLs", "vid1");
        expectDelete("OLD1");
        expectInsert("PLb", "vid2");
        expectDelete("OLD2");

        mvc.perform(json(post("/api/tier-sync"), """
                [{"videoId": "vid1", "fromItemId": "OLD1", "fromPlaylistId": "PLa", "toPlaylistId": "PLs"},
                 {"videoId": "vid2", "fromItemId": "OLD2", "fromPlaylistId": "PLs", "toPlaylistId": "PLb"}]"""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applied").value(2))
            .andExpect(jsonPath("$.results[0].newItemId").value("NEW-vid1"))
            .andExpect(jsonPath("$.results[1].newItemId").value("NEW-vid2"));
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
            .andExpect(jsonPath("$.total").value(3))
            .andExpect(jsonPath("$.results[0].inserted").value(false))
            .andExpect(jsonPath("$.results[0].removed").value(true))
            .andExpect(jsonPath("$.results[0].newItemId").doesNotExist())
            .andExpect(jsonPath("$.results[2].inserted").value(true))
            .andExpect(jsonPath("$.results[2].removed").value(false)) // there was no source item
            .andExpect(jsonPath("$.results[2].newItemId").value("NEW-vid3"));
    }

    @Test
    void aFailedInsertKeepsTheOriginalAndTheRestOfTheBatchStillRuns() throws Exception {
        youtube.expect(requestTo(YT + "/playlistItems?part=snippet"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(content().json("{\"snippet\": {\"playlistId\": \"PLrapS\"}}"))
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
            .andExpect(jsonPath("$.results[0].inserted").value(false))
            .andExpect(jsonPath("$.results[0].removed").value(false))
            .andExpect(jsonPath("$.results[0].newItemId").doesNotExist())
            .andExpect(jsonPath("$.results[0].step").value("insert"))
            .andExpect(jsonPath("$.results[0].error").value(containsString("quota")))
            .andExpect(jsonPath("$.results[1].success").value(true))
            .andExpect(jsonPath("$.results[1].error").doesNotExist());
    }

    @Test
    void aDeleteThatFindsTheItemAlreadyGoneIsASuccess() throws Exception {
        // The bug behind "SOME FAILED": a stale source id 404s on delete.
        youtube = ordered();
        expectInsert("PLrapS", "vid1");
        expectDeleteAnswering("STALE", HttpStatus.NOT_FOUND, "playlistItemNotFound");

        mvc.perform(json(post("/api/tier-sync"), """
                [{"videoId": "vid1", "fromItemId": "STALE", "toPlaylistId": "PLrapS"}]"""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applied").value(1))
            .andExpect(jsonPath("$.results[0].success").value(true))
            .andExpect(jsonPath("$.results[0].inserted").value(true))
            .andExpect(jsonPath("$.results[0].removed").value(true))
            .andExpect(jsonPath("$.results[0].newItemId").value("NEW-vid1"))
            .andExpect(jsonPath("$.results[0].step").doesNotExist());
    }

    @Test
    void aDuplicateCleanupOfAnAlreadyGoneItemIsASuccess() throws Exception {
        expectDeleteAnswering("GONE", HttpStatus.NOT_FOUND, "playlistItemNotFound");

        mvc.perform(json(post("/api/tier-sync"), "[{\"videoId\": \"vid1\", \"fromItemId\": \"GONE\"}]"))
            .andExpect(jsonPath("$.applied").value(1))
            .andExpect(jsonPath("$.results[0].removed").value(true))
            .andExpect(jsonPath("$.results[0].inserted").value(false));
    }

    @Test
    void aRefusedDeleteAfterASuccessfulInsertSaysSoAndCarriesTheNewItemId(CapturedOutput output) throws Exception {
        youtube = ordered();
        expectInsert("PLrapS", "vid1");
        expectDeleteAnswering("OLD1", HttpStatus.FORBIDDEN, "forbidden"); // final, not retried

        mvc.perform(json(post("/api/tier-sync"), """
                [{"videoId": "vid1", "fromItemId": "OLD1", "toPlaylistId": "PLrapS"}]"""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applied").value(0))
            .andExpect(jsonPath("$.results[0].success").value(false))
            .andExpect(jsonPath("$.results[0].inserted").value(true))
            .andExpect(jsonPath("$.results[0].removed").value(false))
            .andExpect(jsonPath("$.results[0].newItemId").value("NEW-vid1"))
            .andExpect(jsonPath("$.results[0].step").value("delete"))
            .andExpect(jsonPath("$.results[0].error").value(containsString("remove the song from its old playlist")));

        assertThat(output).contains("WARN").contains("tier-sync delete failed for video vid1: YouTube 403 (forbidden)");
        assertThat(output).doesNotContain(TOKEN);
    }

    @Test
    void aDeleteKeepsFailingWithAServerErrorIsReportedAfterTheLastRetry(CapturedOutput output) throws Exception {
        expectInsert("PLrapS", "vid1");
        youtube.expect(ExpectedCount.times(PlaylistController.WRITE_ATTEMPTS), requestTo(YT + "/playlistItems?id=OLD1"))
            .andExpect(method(HttpMethod.DELETE))
            .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        mvc.perform(json(post("/api/tier-sync"), """
                [{"videoId": "vid1", "fromItemId": "OLD1", "toPlaylistId": "PLrapS"}]"""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applied").value(0))
            .andExpect(jsonPath("$.results[0].success").value(false))
            .andExpect(jsonPath("$.results[0].inserted").value(true))
            .andExpect(jsonPath("$.results[0].newItemId").value("NEW-vid1"))
            .andExpect(jsonPath("$.results[0].step").value("delete"))
            .andExpect(jsonPath("$.results[0].error").value(containsString("temporary problem")));

        assertThat(output).contains("tier-sync delete failed for video vid1: YouTube 500");
    }

    @Test
    void aPassingServerErrorOnADeleteIsRetried() throws Exception {
        youtube = ordered();
        expectInsert("PLrapS", "vid1");
        youtube.expect(requestTo(YT + "/playlistItems?id=OLD1")).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        youtube.expect(requestTo(YT + "/playlistItems?id=OLD1")).andRespond(withException(new IOException("reset")));
        expectDelete("OLD1");

        mvc.perform(json(post("/api/tier-sync"), """
                [{"videoId": "vid1", "fromItemId": "OLD1", "toPlaylistId": "PLrapS"}]"""))
            .andExpect(jsonPath("$.applied").value(1))
            .andExpect(jsonPath("$.results[0].removed").value(true));
    }

    @Test
    void aRetriedDeleteThatTookEffectTheFirstTimeIsASuccess() throws Exception {
        // The 503'd delete went through after all: the retry finds it gone.
        youtube = ordered();
        youtube.expect(requestTo(YT + "/playlistItems?id=OLD1")).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        expectDeleteAnswering("OLD1", HttpStatus.NOT_FOUND, "playlistItemNotFound");

        mvc.perform(json(post("/api/tier-sync"), "[{\"videoId\": \"vid1\", \"fromItemId\": \"OLD1\"}]"))
            .andExpect(jsonPath("$.applied").value(1))
            .andExpect(jsonPath("$.results[0].removed").value(true));
    }

    @Test
    void aServerErrorOnAnInsertIsNotRetriedSinceItMayHaveLandedAndTheOriginalStays(CapturedOutput output) throws Exception {
        youtube.expect(ExpectedCount.once(), requestTo(YT + "/playlistItems?part=snippet"))
            .andExpect(method(HttpMethod.POST))
            .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(500, "backendError", "Backend Error")));

        mvc.perform(json(post("/api/tier-sync"), """
                [{"videoId": "vid1", "fromItemId": "OLD1", "toPlaylistId": "PLrapS"}]"""))
            .andExpect(jsonPath("$.results[0].success").value(false))
            .andExpect(jsonPath("$.results[0].inserted").value(false))
            .andExpect(jsonPath("$.results[0].removed").value(false))
            .andExpect(jsonPath("$.results[0].step").value("insert"))
            .andExpect(jsonPath("$.results[0].error").value(containsString("temporary problem")));

        assertThat(output).contains("tier-sync insert failed for video vid1: YouTube 500 (backendError): Backend Error");
    }

    @Test
    void anAbortedInsertIsTriedAgain() throws Exception {
        youtube = ordered();
        youtube.expect(requestTo(YT + "/playlistItems?part=snippet"))
            .andRespond(withStatus(HttpStatus.CONFLICT).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(409, "SERVICE_UNAVAILABLE", "The operation was aborted.")));
        expectInsert("PLrapS", "vid1");
        expectDelete("OLD1");

        mvc.perform(json(post("/api/tier-sync"), """
                [{"videoId": "vid1", "fromItemId": "OLD1", "toPlaylistId": "PLrapS"}]"""))
            .andExpect(jsonPath("$.applied").value(1))
            .andExpect(jsonPath("$.results[0].newItemId").value("NEW-vid1"));
    }

    @Test
    void insertFailuresSayWhatIsMissingOrUnreachable() throws Exception {
        youtube.expect(requestTo(YT + "/playlistItems?part=snippet"))
            .andExpect(content().json("{\"snippet\": {\"playlistId\": \"PLrapS\"}}"))
            .andRespond(withStatus(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(404, "videoNotFound", "Video not found.")));
        youtube.expect(requestTo(YT + "/playlistItems?part=snippet"))
            .andExpect(content().json("{\"snippet\": {\"playlistId\": \"PLgone\"}}"))
            .andRespond(withStatus(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(404, "playlistNotFound", "Playlist not found.")));
        youtube.expect(ExpectedCount.once(), requestTo(YT + "/playlistItems?part=snippet"))
            .andExpect(content().json("{\"snippet\": {\"playlistId\": \"PLnet\"}}"))
            .andRespond(withException(new IOException("timed out")));

        mvc.perform(json(post("/api/tier-sync"), """
                [{"videoId": "vid1", "fromItemId": "OLD1", "toPlaylistId": "PLrapS"},
                 {"videoId": "vid2", "fromItemId": "OLD2", "toPlaylistId": "PLgone"},
                 {"videoId": "vid3", "fromItemId": "OLD3", "toPlaylistId": "PLnet"}]"""))
            .andExpect(jsonPath("$.applied").value(0))
            .andExpect(jsonPath("$.results[0].error").value(containsString("no longer on YouTube")))
            .andExpect(jsonPath("$.results[1].error").value(containsString("playlist no longer exists")))
            .andExpect(jsonPath("$.results[2].error").value(containsString("Couldn't reach YouTube")))
            .andExpect(jsonPath("$.results[2].step").value("insert"));
    }

    @Test
    void aRowRepeatingAnEarlierRowIsNotSentToYoutubeTwice() throws Exception {
        // Same source item twice: one insert, one delete - never a second copy.
        youtube.expect(ExpectedCount.once(), requestTo(YT + "/playlistItems?part=snippet"))
            .andExpect(content().json("{\"snippet\": {\"playlistId\": \"PLrapS\"}}"))
            .andRespond(withSuccess("{\"id\": \"NEW-vid1\"}", MediaType.APPLICATION_JSON));
        youtube.expect(ExpectedCount.once(), requestTo(YT + "/playlistItems?id=OLD1")).andRespond(withNoContent());
        // Insert-only rows: the same video into the same playlist once.
        youtube.expect(ExpectedCount.once(), requestTo(YT + "/playlistItems?part=snippet"))
            .andExpect(content().json("{\"snippet\": {\"playlistId\": \"PLrapA\"}}"))
            .andRespond(withSuccess("{\"id\": \"NEW-vid2\"}", MediaType.APPLICATION_JSON));

        mvc.perform(json(post("/api/tier-sync"), """
                [{"videoId": "vid1", "fromItemId": "OLD1", "toPlaylistId": "PLrapS"},
                 {"videoId": "vid2", "toPlaylistId": "PLrapA"},
                 {"videoId": "vid1", "fromItemId": "OLD1", "toPlaylistId": "PLrapS"},
                 {"videoId": "vid1", "fromItemId": "OLD1", "toPlaylistId": "PLrapB"},
                 {"videoId": "vid2", "toPlaylistId": "PLrapA"}]"""))
            .andExpect(jsonPath("$.total").value(5))
            .andExpect(jsonPath("$.applied").value(4))
            .andExpect(jsonPath("$.results[2].success").value(true))
            .andExpect(jsonPath("$.results[2].newItemId").value("NEW-vid1"))
            // The same item sent to another tier too: only the first move is made.
            .andExpect(jsonPath("$.results[3].success").value(false))
            .andExpect(jsonPath("$.results[3].inserted").value(false))
            .andExpect(jsonPath("$.results[3].removed").value(true))
            .andExpect(jsonPath("$.results[3].step").value("insert"))
            .andExpect(jsonPath("$.results[3].error").value(containsString("already moved")))
            .andExpect(jsonPath("$.results[4].newItemId").value("NEW-vid2"));
    }

    @Test
    void aMoveWithoutAVideoIdFailsWithoutCallingYoutube() throws Exception {
        mvc.perform(json(post("/api/tier-sync"), "[{\"fromItemId\": \"OLD1\", \"toPlaylistId\": \"PLrapS\"}]"))
            .andExpect(jsonPath("$.applied").value(0))
            .andExpect(jsonPath("$.results[0].success").value(false))
            .andExpect(jsonPath("$.results[0].step").value("insert"))
            .andExpect(jsonPath("$.results[0].removed").value(false));
    }

    @Test
    void anInsertAnswerWithoutAnIdStillCountsAsInserted() throws Exception {
        youtube.expect(requestTo(YT + "/playlistItems?part=snippet")).andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        mvc.perform(json(post("/api/tier-sync"), "[{\"videoId\": \"vid1\", \"toPlaylistId\": \"PLrapS\"}]"))
            .andExpect(jsonPath("$.results[0].success").value(true))
            .andExpect(jsonPath("$.results[0].inserted").value(true))
            .andExpect(jsonPath("$.results[0].newItemId").value(nullValue()));
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
            .andExpect(content().json("{\"id\": \"PL2\"}"))
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
            .andExpect(jsonPath("$.results[0].error").value("This playlist no longer exists on YouTube."))
            .andExpect(jsonPath("$.results[1].success").value(false))
            .andExpect(jsonPath("$.results[1].error").value("YouTube refused the request: forbidden"))
            .andExpect(jsonPath("$.results[2].success").value(false))
            .andExpect(jsonPath("$.results[2].error").value("YouTube had a temporary problem - try again."))
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
            .andExpect(content().json("{\"snippet\": {\"title\": \"Rap S\"}}"))
            .andRespond(withStatus(HttpStatus.FORBIDDEN).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(403, "quotaExceeded", "quota")));
        youtube.expect(requestTo(YT + "/playlists?part=snippet,status"))
            .andExpect(content().json("{\"snippet\": {\"title\": \"Rap A\"}}"))
            .andRespond(withSuccess("{\"id\": \"PLok\"}", MediaType.APPLICATION_JSON));

        mvc.perform(json(post("/api/playlists/create"), "[{\"title\": \"Rap S\"}, {\"title\": \"Rap A\"}]"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applied").value(1))
            .andExpect(jsonPath("$.results[0].success").value(false))
            .andExpect(jsonPath("$.results[0].error").value(containsString("daily API quota")))
            .andExpect(jsonPath("$.results[0].id").doesNotExist())
            .andExpect(jsonPath("$.results[1].success").value(true))
            .andExpect(jsonPath("$.results[1].id").value("PLok"));
    }

    // Per-playlist failures read like every other YouTube error (YoutubeError):
    // plain language, never the HTTP client's raw exception text.
    @Test
    void renameAndCreateFailuresAreInPlainLanguage() throws Exception {
        youtube.expect(requestTo(YT + "/playlists?part=snippet&id=PLq"))
            .andRespond(withStatus(HttpStatus.FORBIDDEN).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(403, "quotaExceeded", "quota")));
        youtube.expect(requestTo(YT + "/playlists?part=snippet&id=PLexp"))
            .andRespond(withStatus(HttpStatus.UNAUTHORIZED).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(401, "authError", "Invalid Credentials")));
        youtube.expect(requestTo(YT + "/playlists?part=snippet&id=PLscope"))
            .andRespond(withStatus(HttpStatus.FORBIDDEN).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(403, "insufficientPermissions", "Insufficient Permission")));
        youtube.expect(requestTo(YT + "/playlists?part=snippet&id=PLnet")).andRespond(withException(new IOException("Connection refused")));
        expectGet(YT + "/playlists?part=snippet&id=PLgone", "{\"items\": [{\"id\": \"PLgone\", \"snippet\": {\"title\": \"Old\"}}]}");
        youtube.expect(requestTo(YT + "/playlists?part=snippet"))
            .andExpect(method(HttpMethod.PUT))
            .andRespond(withStatus(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(404, "playlistNotFound", "Playlist not found")));

        mvc.perform(json(post("/api/playlists/rename"), """
                [{"id": "PLq", "title": "A"}, {"id": "PLexp", "title": "B"}, {"id": "PLscope", "title": "C"},
                 {"id": "PLnet", "title": "D"}, {"id": "PLgone", "title": "E"}]"""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applied").value(0))
            .andExpect(jsonPath("$.results[0].error").value(containsString("daily API quota")))
            .andExpect(jsonPath("$.results[1].error").value(containsString("log out and back in")))
            .andExpect(jsonPath("$.results[2].error").value(containsString("tick the YouTube permission")))
            .andExpect(jsonPath("$.results[3].error").value(containsString("Couldn't reach YouTube")))
            .andExpect(jsonPath("$.results[4].error").value("This playlist no longer exists on YouTube."));
    }

    @Test
    void createFailuresAreInPlainLanguage() throws Exception {
        youtube.expect(requestTo(YT + "/playlists?part=snippet,status"))
            .andExpect(content().json("{\"snippet\": {\"title\": \"Rap S\"}}"))
            .andRespond(withException(new IOException("Connection refused")));
        youtube.expect(ExpectedCount.times(PlaylistController.WRITE_ATTEMPTS), requestTo(YT + "/playlists?part=snippet,status"))
            .andExpect(content().json("{\"snippet\": {\"title\": \"Rap A\"}}"))
            .andRespond(withStatus(HttpStatus.CONFLICT).contentType(MediaType.APPLICATION_JSON)
                .body(youtubeError(409, "SERVICE_UNAVAILABLE", "The operation was aborted.")));

        mvc.perform(json(post("/api/playlists/create"), "[{\"title\": \"Rap S\"}, {\"title\": \"Rap A\"}]"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applied").value(0))
            .andExpect(jsonPath("$.results[0].error").value("Couldn't reach YouTube - check the connection and try again."))
            .andExpect(jsonPath("$.results[1].error").value(containsString("busy")))
            .andExpect(jsonPath("$.results[1].error").value(org.hamcrest.Matchers.not(containsString("409"))));
    }

    // ---- bad bodies ---------------------------------------------------------

    // A body the frontend would never send is a 400 ProblemDetail saying
    // what's wrong - before any YouTube call, never a bare 500.
    @Test
    void badBodiesAre400ProblemDetailsAndCallNothing() throws Exception {
        youtube.expect(ExpectedCount.never(), requestTo(org.hamcrest.Matchers.startsWith(YT)));
        String[][] cases = {
            {"/api/playlists/PL1/items", "{}"},
            {"/api/playlists/PL1/items", "{\"videoId\": \" \"}"},
            {"/api/playlists/PL1/items", "{\"videoId\": {\"x\": 1}}"},
            {"/api/playlists/PL1/items", ""},
            {"/api/tier-sync", "[null]"},
            {"/api/tier-sync", "[{\"videoId\": {\"x\": 1}, \"toPlaylistId\": \"PL1\"}]"},
            {"/api/tier-sync", "[{\"videoId\": \"v\", \"toPlaylistId\": [\"PL1\"]}]"},
            {"/api/tier-sync", "{\"videoId\": \"v\"}"},
            {"/api/tier-sync", "not json"},
            {"/api/playlists/rename", "[{}]"},
            {"/api/playlists/rename", "[{\"id\": \"PL1\"}]"},
            {"/api/playlists/rename", "[{\"id\": \"PL1\", \"title\": \"  \"}]"},
            {"/api/playlists/rename", "[{\"id\": 5, \"title\": \"Rap S\"}]"},
            {"/api/playlists/rename", "[null]"},
            {"/api/playlists/create", "[{}]"},
            {"/api/playlists/create", "[{\"title\": [\"Rap S\"]}]"},
            {"/api/playlists/create", "[{\"title\": \"Rap S\", \"privacyStatus\": \"secret\"}]"},
            {"/api/playlists/create", "null"},
        };
        for (String[] c : cases) {
            mvc.perform(json(post(c[0]), c[1]))
                .andExpect(r -> assertThat(r.getResponse().getStatus()).as(c[0] + " " + c[1]).isEqualTo(400))
                .andExpect(r -> assertThat(r.getResponse().getContentType()).as(c[0] + " " + c[1])
                    .isEqualTo(MediaType.APPLICATION_PROBLEM_JSON_VALUE));
        }
        mvc.perform(json(post("/api/playlists/rename"), "[{\"id\": \"PL1\"}]"))
            .andExpect(jsonPath("$.detail").value("Row 1: title is missing."));
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

    // No answer at all (connection refused, timeout, DNS) on any read: a 502
    // ProblemDetail that says so - never a bare 500 with no detail.
    @Test
    void youtubeBeingUnreachableIsA502SayingSo() throws Exception {
        youtube.expect(requestTo(YT + "/playlists?part=snippet,contentDetails&mine=true&maxResults=50&fields=" + PlaylistController.PLAYLIST_FIELDS))
            .andRespond(withException(new IOException("Connection refused")));
        youtube.expect(requestTo(itemsUrl("PL1"))).andRespond(withException(new IOException("Read timed out")));
        youtube.expect(requestTo(YT + "/videos?part=snippet&id=vid1&fields=" + PlaylistController.VIDEO_FIELDS))
            .andRespond(withException(new IOException("UnknownHost")));
        youtube.expect(requestTo(YT + "/playlistItems?part=snippet")).andRespond(withException(new IOException("reset")));

        for (MockHttpServletRequestBuilder request : new MockHttpServletRequestBuilder[] {
            get("/api/playlists").with(signedIn()),
            get("/api/playlists/PL1/items").with(signedIn()),
            get("/api/videos/vid1").with(signedIn()),
            json(post("/api/playlists/PL1/items"), "{\"videoId\": \"vid1\"}"),
        }) {
            mvc.perform(request)
                .andExpect(status().isBadGateway())
                .andExpect(r -> assertThat(r.getResponse().getContentType()).isEqualTo(MediaType.APPLICATION_PROBLEM_JSON_VALUE))
                .andExpect(jsonPath("$.status").value(502))
                .andExpect(jsonPath("$.detail").value(containsString("Couldn't reach YouTube")));
        }
    }

    // A delete is retried on network failures; still unreachable after the
    // last try is the same 502.
    @Test
    void aDeleteThatNeverReachesYoutubeIsA502AfterTheRetries() throws Exception {
        youtube.expect(ExpectedCount.times(PlaylistController.WRITE_ATTEMPTS), requestTo(YT + "/playlistItems?id=ITEM1"))
            .andRespond(withException(new IOException("Connection refused")));

        mvc.perform(delete("/api/playlist-items/ITEM1").with(signedIn()))
            .andExpect(status().isBadGateway())
            .andExpect(jsonPath("$.detail").value(containsString("Couldn't reach YouTube")));
    }

    // An answer that isn't the JSON the app expects (a proxy's HTML error
    // page with a 200, say) is a 502 too.
    @Test
    void anUnreadableYoutubeAnswerIsA502SayingSo() throws Exception {
        youtube.expect(requestTo(itemsUrl("PL1"))).andRespond(withSuccess("<html>oops</html>", MediaType.APPLICATION_JSON));

        mvc.perform(get("/api/playlists/PL1/items").with(signedIn()))
            .andExpect(status().isBadGateway())
            .andExpect(jsonPath("$.detail").value(containsString("couldn't read")));
    }
}
