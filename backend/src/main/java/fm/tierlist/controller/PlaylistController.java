package fm.tierlist.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.RequestEntity;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.annotation.RegisteredOAuth2AuthorizedClient;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Predicate;
import java.util.function.Supplier;

@RestController
public class PlaylistController {

    private static final Logger log = LoggerFactory.getLogger(PlaylistController.class);

    // How many YouTube writes a batch (tier-sync, rename, create) runs at
    // once - see YoutubeBatch. Inside the HTTP client's per-host pool (5).
    static final int WRITE_PARALLELISM = 4;

    private final String apiBase;
    private final RestTemplate restTemplate;

    // The base URL is a property only so tests can aim it elsewhere; the default is YouTube's.
    public PlaylistController(
            RestTemplate youtubeRestTemplate,
            @Value("${app.youtube.api-base:https://www.googleapis.com/youtube/v3}") String youtubeApiBase
    ) {
        this.restTemplate = youtubeRestTemplate;
        this.apiBase = youtubeApiBase;
    }

    @GetMapping("/api/auth/status")
    public Map<String, Object> authStatus(Authentication authentication) {
        boolean loggedIn = authentication != null
            && authentication.isAuthenticated()
            && !(authentication instanceof AnonymousAuthenticationToken);
        // userId (the Google `sub`) lets the browser tell whose board cache
        // it holds, so one account's cached playlists are never shown to another.
        return loggedIn ? Map.of("loggedIn", true, "userId", authentication.getName()) : Map.of("loggedIn", false);
    }

    @GetMapping("/api/playlists")
    public List<Map<String, Object>> playlists(@RegisteredOAuth2AuthorizedClient("google") OAuth2AuthorizedClient client) {
        List<Map<String, Object>> allItems = fetchAllPages(
            client,
            apiBase + "/playlists?part=snippet,contentDetails&mine=true&maxResults=50&fields=" + PLAYLIST_FIELDS
        );

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> p : allItems) {
            Map<String, Object> snippet = (Map<String, Object>) p.get("snippet");
            Map<String, Object> contentDetails = (Map<String, Object>) p.get("contentDetails");
            Map<String, Object> thumbnails = (Map<String, Object>) snippet.get("thumbnails");

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", p.get("id"));
            out.put("title", snippet.get("title"));
            out.put("thumbnail", extractThumbnail(thumbnails));
            out.put("itemCount", contentDetails != null ? contentDetails.get("itemCount") : 0);
            result.add(out);
        }
        return result;
    }

    // Partial response: only what playlists() reads (no descriptions, no
    // unused thumbnail sizes) - a smaller page for every account's list.
    static final String PLAYLIST_FIELDS =
        "nextPageToken,items(id,snippet(title,thumbnails(medium/url,default/url)),contentDetails/itemCount)";

    // Partial response for a pasted link: only what video() reads.
    static final String VIDEO_FIELDS = "items(id,snippet(title,channelTitle,thumbnails(medium/url,default/url)))";

    // YouTube's partial response: only what toVideo() reads. A big to-do list
    // is many pages fetched one after another (each needs the last one's
    // token), so a smaller page - no descriptions, one thumbnail size - is
    // the main lever on how long a board takes to load. Same quota cost.
    static final String ITEM_FIELDS =
        "nextPageToken,items(id,snippet(title,videoOwnerChannelTitle,resourceId/videoId,thumbnails(medium/url,default/url)),contentDetails/videoId)";

    @GetMapping("/api/playlists/{id}/items")
    public List<Map<String, Object>> playlistItems(
            @PathVariable String id,
            @RegisteredOAuth2AuthorizedClient("google") OAuth2AuthorizedClient client
    ) {
        List<Map<String, Object>> allItems = fetchAllPages(
            client,
            apiBase + "/playlistItems?part=snippet,contentDetails&playlistId=" + id + "&maxResults=50&fields=" + ITEM_FIELDS
        );

        return toVideos(allItems);
    }

    /** One video's details, for a pasted link. 404 if it doesn't exist / is private. Quota: 1 unit. */
    @GetMapping("/api/videos/{videoId}")
    public ResponseEntity<Map<String, Object>> video(
            @PathVariable String videoId,
            @RegisteredOAuth2AuthorizedClient("google") OAuth2AuthorizedClient client
    ) {
        Map<String, Object> body = callYoutubeApi(client, apiBase + "/videos?part=snippet&id=" + videoId + "&fields=" + VIDEO_FIELDS);
        List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
        if (items == null || items.isEmpty()) return ResponseEntity.notFound().build();
        Map<String, Object> snippet = (Map<String, Object>) items.get(0).get("snippet");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("videoId", items.get(0).get("id"));
        out.put("title", snippet.get("title"));
        out.put("channelTitle", snippet.get("channelTitle"));
        out.put("thumbnail", extractThumbnail((Map<String, Object>) snippet.get("thumbnails")));
        return ResponseEntity.ok(out);
    }

    /**
     * Adds one video to a playlist (filing an Inbox song straight into a tier)
     * and returns it in the same shape as /items - including the new
     * playlistItem id, which is what undo deletes. Body: { "videoId" }.
     */
    @PostMapping("/api/playlists/{id}/items")
    public Map<String, Object> addItem(
            @PathVariable String id,
            @RequestBody Map<String, String> body,
            @RegisteredOAuth2AuthorizedClient("google") OAuth2AuthorizedClient client
    ) {
        return toVideo(insertPlaylistItem(client, id, body.get("videoId")));
    }

    @DeleteMapping("/api/playlist-items/{itemId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeItem(
            @PathVariable String itemId,
            @RegisteredOAuth2AuthorizedClient("google") OAuth2AuthorizedClient client
    ) {
        deletePlaylistItem(client, itemId);
    }

    private List<Map<String, Object>> toVideos(List<Map<String, Object>> playlistItems) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> i : playlistItems) {
            Map<String, Object> video = toVideo(i);
            String title = (String) video.get("title");
            if ("Deleted video".equals(title) || "Private video".equals(title)) {
                continue;
            }
            result.add(video);
        }
        return result;
    }

    private Map<String, Object> toVideo(Map<String, Object> playlistItem) {
        Map<String, Object> snippet = (Map<String, Object>) playlistItem.get("snippet");
        Map<String, Object> contentDetails = (Map<String, Object>) playlistItem.get("contentDetails");
        Map<String, Object> resourceId = (Map<String, Object>) snippet.get("resourceId");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", playlistItem.get("id")); // playlistItem id - needed to remove this item later
        out.put("videoId", contentDetails != null ? contentDetails.get("videoId") : resourceId.get("videoId"));
        out.put("title", snippet.get("title"));
        out.put("channelTitle", snippet.get("videoOwnerChannelTitle"));
        out.put("thumbnail", extractThumbnail((Map<String, Object>) snippet.get("thumbnails")));
        return out;
    }

    /**
     * Moves videos between playlists: inserts into the target playlist first, then
     * removes the original playlistItem, so a failed delete never loses a video.
     * A null/blank toPlaylistId means "delete only" - used for a duplicate cleanup,
     * where the video already exists in another of this board's tier playlists and
     * this occurrence is just the redundant copy, not a real move. A missing
     * fromItemId means "insert only" (a new filing).
     * Each entry is applied independently; failures are reported per-item rather than
     * aborting the whole batch. Body: [{ "videoId", "fromItemId"?, "toPlaylistId"? }].
     * <p>
     * Each result: {@code videoId}, {@code success}, {@code inserted} (the insert
     * ran and YouTube took it), {@code removed} (the source item is gone - deleted
     * now, or YouTube says it already was), {@code newItemId} (the inserted
     * playlistItem's id, only when {@code inserted}) and, on failure, {@code step}
     * ("insert" | "delete") and a plain-language {@code error}. The new id matters:
     * the browser must use it as the song's item id from now on, or its next move
     * deletes the old (gone) id and re-inserts - a duplicate.
     * <p>
     * A row repeating an earlier row's source item (or an earlier insert-only row)
     * is not sent to YouTube again - that second insert would be a duplicate.
     */
    @PostMapping("/api/tier-sync")
    public Map<String, Object> tierSync(
            @RequestBody List<Map<String, Object>> moves,
            @RegisteredOAuth2AuthorizedClient("google") OAuth2AuthorizedClient client
    ) {
        int[] repeats = new int[moves.size()]; // index of the earlier row this one repeats, or -1
        Map<String, Integer> firstRow = new HashMap<>();
        List<Integer> toRun = new ArrayList<>();
        for (int i = 0; i < moves.size(); i++) {
            String key = rowKey(moves.get(i));
            Integer first = key == null ? null : firstRow.putIfAbsent(key, i);
            repeats[i] = first == null ? -1 : first;
            if (first == null) toRun.add(i);
        }
        // Moves into the same playlist run one after another (keyed by it).
        List<Map<String, Object>> ran = YoutubeBatch.run(toRun, WRITE_PARALLELISM,
            i -> moves.get(i).get("toPlaylistId"), i -> moveOne(client, moves.get(i)));

        Map<Integer, Map<String, Object>> byRow = new HashMap<>();
        for (int k = 0; k < toRun.size(); k++) byRow.put(toRun.get(k), ran.get(k));
        List<Map<String, Object>> results = new ArrayList<>();
        for (int i = 0; i < moves.size(); i++) {
            results.add(repeats[i] < 0 ? byRow.get(i) : repeatOf(moves.get(i), moves.get(repeats[i]), byRow.get(repeats[i])));
        }
        return batchResponse(results);
    }

    // Two rows doing the same YouTube work share a key: the same source item,
    // or (insert-only) the same video into the same playlist. Null = nothing to do.
    private static String rowKey(Map<String, Object> move) {
        String fromItemId = text(move.get("fromItemId"));
        String toPlaylistId = text(move.get("toPlaylistId"));
        if (fromItemId != null) return "from:" + fromItemId;
        if (toPlaylistId != null) return "new:" + move.get("videoId") + "\n" + toPlaylistId;
        return null;
    }

    private static Map<String, Object> repeatOf(Map<String, Object> move, Map<String, Object> first, Map<String, Object> firstResult) {
        String videoId = (String) move.get("videoId");
        if (Objects.equals(text(move.get("toPlaylistId")), text(first.get("toPlaylistId")))) {
            Map<String, Object> same = new LinkedHashMap<>(firstResult);
            same.put("videoId", videoId);
            return same;
        }
        log.warn("tier-sync insert skipped for video {}: its source item is moved by an earlier row of the same push", videoId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("videoId", videoId);
        result.put("success", false);
        result.put("inserted", false);
        result.put("removed", firstResult.get("removed"));
        result.put("step", "insert");
        result.put("error", "This song was already moved to another tier in this push - only that move was made.");
        return result;
    }

    // One row of a tier-sync: insert (if a target), then delete (if a source).
    private Map<String, Object> moveOne(OAuth2AuthorizedClient client, Map<String, Object> move) {
        String videoId = (String) move.get("videoId");
        String fromItemId = text(move.get("fromItemId"));
        String toPlaylistId = text(move.get("toPlaylistId"));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("videoId", videoId);
        boolean inserted = false;
        String newItemId = null;
        if (toPlaylistId != null) {
            if (videoId == null || videoId.isBlank()) {
                log.warn("tier-sync insert failed: no videoId in the request");
                return finish(result, false, false, false, null, "insert", "No video id was sent for this song.");
            }
            try {
                Map<String, Object> item = insertPlaylistItem(client, toPlaylistId, videoId);
                inserted = true;
                newItemId = item != null && item.get("id") instanceof String id ? id : null;
            } catch (RuntimeException e) {
                return finish(result, false, false, false, null, "insert", failure("insert", videoId, e));
            }
        }
        boolean removed = false;
        if (fromItemId != null) {
            try {
                deletePlaylistItem(client, fromItemId);
                removed = true;
            } catch (HttpClientErrorException.NotFound e) {
                removed = true; // already gone - what the delete was for
            } catch (RuntimeException e) {
                return finish(result, false, inserted, false, newItemId, "delete", failure("delete", videoId, e));
            }
        }
        return finish(result, true, inserted, removed, newItemId, null, null);
    }

    private static Map<String, Object> finish(Map<String, Object> result, boolean success, boolean inserted,
                                              boolean removed, String newItemId, String step, String error) {
        result.put("success", success);
        result.put("inserted", inserted);
        result.put("removed", removed);
        if (inserted) result.put("newItemId", newItemId);
        if (step != null) {
            result.put("step", step);
            result.put("error", error);
        }
        return result;
    }

    // Logs one failed write (YouTube's status / reason only - never the token)
    // and says in plain words what went wrong.
    private static String failure(String step, String videoId, RuntimeException e) {
        if (e instanceof HttpStatusCodeException http) {
            YoutubeError error = YoutubeError.of(http);
            log.warn("tier-sync {} failed for video {}: YouTube {} ({}): {}",
                step, videoId, error.youtubeStatus(), error.reason(), error.message());
            return writeFailure(step, error);
        }
        log.warn("tier-sync {} failed for video {}: {}", step, videoId, e.toString());
        if (e instanceof ResourceAccessException) return "Couldn't reach YouTube - check the connection and push again.";
        return "Something went wrong talking to YouTube - push again.";
    }

    // The per-item sentence for a failed tier-sync write: the shared mapping,
    // made specific where the step tells us more.
    static String writeFailure(String step, YoutubeError error) {
        String reason = error.reason() == null ? "" : error.reason();
        if (reason.equals("videoNotFound")) return "This video is no longer on YouTube (deleted or made private).";
        if (reason.equals("playlistNotFound")) return "The target playlist no longer exists on YouTube.";
        if ("delete".equals(step) && error.youtubeStatus() == 403 && error.status() == HttpStatus.BAD_GATEWAY) {
            return "YouTube won't let this app remove the song from its old playlist.";
        }
        if (error.youtubeStatus() == 409) return "YouTube was busy with this playlist and gave up - push again.";
        if (error.youtubeStatus() >= 500) return "YouTube had a temporary problem - push again.";
        return error.detail();
    }

    private static String text(Object value) {
        return value instanceof String s && !s.isBlank() ? s : null;
    }

    private static Map<String, Object> batchResponse(List<Map<String, Object>> results) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("applied", results.stream().filter(r -> Boolean.TRUE.equals(r.get("success"))).count());
        response.put("total", results.size());
        response.put("results", results);
        return response;
    }

    /**
     * Renames playlists (the naming-template migration job). YouTube's
     * playlists.update replaces the whole snippet, so each playlist's current
     * snippet is read first and only the title is changed - otherwise its
     * description / language would be wiped. Body: [{ "id", "title" }].
     * Per-item results; one failure never aborts the batch.
     * Quota: ~51 units per playlist (list 1 + update 50).
     */
    @PostMapping("/api/playlists/rename")
    public Map<String, Object> renamePlaylists(
            @RequestBody List<Map<String, Object>> renames,
            @RegisteredOAuth2AuthorizedClient("google") OAuth2AuthorizedClient client
    ) {
        List<Map<String, Object>> results = YoutubeBatch.run(renames, WRITE_PARALLELISM, rename -> rename.get("id"), rename -> {
            String id = (String) rename.get("id");
            String title = (String) rename.get("title");
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("id", id);
            result.put("title", title);
            try {
                Map<String, Object> body = callYoutubeApi(client, apiBase + "/playlists?part=snippet&id=" + id);
                List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
                if (items == null || items.isEmpty()) throw new IllegalStateException("Playlist not found");
                Map<String, Object> snippet = new LinkedHashMap<>((Map<String, Object>) items.get(0).get("snippet"));
                Map<String, Object> newSnippet = new LinkedHashMap<>();
                newSnippet.put("title", title);
                if (snippet.get("description") != null) newSnippet.put("description", snippet.get("description"));
                if (snippet.get("defaultLanguage") != null) newSnippet.put("defaultLanguage", snippet.get("defaultLanguage"));
                sendJson(client, HttpMethod.PUT, apiBase + "/playlists?part=snippet", Map.of("id", id, "snippet", newSnippet));
                result.put("success", true);
            } catch (Exception e) {
                result.put("success", false);
                result.put("error", e.getMessage());
            }
            return result;
        });
        return batchResponse(results);
    }

    /**
     * Creates playlists (new tier list / missing tiers). Body:
     * [{ "title", "privacyStatus"? }] - privacy defaults to private.
     * Quota: 50 units per playlist.
     */
    @PostMapping("/api/playlists/create")
    public Map<String, Object> createPlaylists(
            @RequestBody List<Map<String, Object>> playlists,
            @RegisteredOAuth2AuthorizedClient("google") OAuth2AuthorizedClient client
    ) {
        // Each new playlist is its own key: nothing else writes to it yet.
        List<Map<String, Object>> results = YoutubeBatch.run(playlists, WRITE_PARALLELISM, playlist -> new Object(), playlist -> {
            String title = (String) playlist.get("title");
            Object privacy = playlist.getOrDefault("privacyStatus", "private");
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("title", title);
            try {
                Map<String, Object> created = sendJson(
                    client,
                    HttpMethod.POST,
                    apiBase + "/playlists?part=snippet,status",
                    Map.of("snippet", Map.of("title", title), "status", Map.of("privacyStatus", privacy))
                );
                result.put("id", created != null ? created.get("id") : null);
                result.put("success", true);
            } catch (Exception e) {
                result.put("success", false);
                result.put("error", e.getMessage());
            }
            return result;
        });
        return batchResponse(results);
    }

    private Map<String, Object> sendJson(OAuth2AuthorizedClient client, HttpMethod method, String url, Map<String, Object> body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(client.getAccessToken().getTokenValue());
        headers.setContentType(MediaType.APPLICATION_JSON);
        return retryAborted(() -> restTemplate.exchange(url, method, new HttpEntity<>(body, headers), Map.class).getBody());
    }

    // Not retried beyond YouTube's 409: a 5xx / timeout on an insert may
    // still have added the video, and trying again would add it twice.
    private Map<String, Object> insertPlaylistItem(OAuth2AuthorizedClient client, String playlistId, String videoId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(client.getAccessToken().getTokenValue());
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> resourceId = Map.of("kind", "youtube#video", "videoId", videoId);
        Map<String, Object> snippet = Map.of("playlistId", playlistId, "resourceId", resourceId);
        Map<String, Object> body = Map.of("snippet", snippet);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
        return retryAborted(() -> restTemplate.exchange(apiBase + "/playlistItems?part=snippet", HttpMethod.POST, entity, Map.class).getBody());
    }

    // A delete is safe to repeat (a second one that finds it gone is a 404,
    // which callers treat as done), so YouTube's passing 5xx and network
    // blips are retried too.
    private void deletePlaylistItem(OAuth2AuthorizedClient client, String playlistItemId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(client.getAccessToken().getTokenValue());
        HttpEntity<Void> entity = new HttpEntity<>(headers);
        retryTransient(() -> restTemplate.exchange(
            apiBase + "/playlistItems?id=" + playlistItemId,
            HttpMethod.DELETE,
            entity,
            Void.class
        ));
    }

    static final int WRITE_ATTEMPTS = 4;
    static final long RETRY_BASE_MILLIS = 200;

    // YouTube answers 409 ABORTED (reason SERVICE_UNAVAILABLE) when two writes
    // touch one playlist at once - batches run a few writes in parallel, and a
    // move's delete hits its *source* playlist, which another group may be
    // writing to. Nothing was applied, so the write is simply tried again
    // after a growing, jittered wait (so colliding writers spread out); any
    // other error is final.
    static <T> T retryAborted(Supplier<T> write) {
        return retry(write, PlaylistController::aborted);
    }

    // retryAborted, plus YouTube's 5xx (backendError, ...) and network
    // failures - only for writes that are safe to repeat.
    static <T> T retryTransient(Supplier<T> write) {
        return retry(write, e -> aborted(e) || e instanceof HttpServerErrorException || e instanceof ResourceAccessException);
    }

    private static boolean aborted(RuntimeException e) {
        return e instanceof HttpClientErrorException.Conflict;
    }

    private static <T> T retry(Supplier<T> write, Predicate<RuntimeException> retryable) {
        for (int attempt = 1; ; attempt++) {
            try {
                return write.get();
            } catch (RuntimeException e) {
                if (attempt >= WRITE_ATTEMPTS || !retryable.test(e)) throw e;
                try {
                    Thread.sleep(backoff(attempt));
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw e;
                }
            }
        }
    }

    // 200, 400, 800 ms (+ up to half again, random) before attempts 2, 3, 4.
    static long backoff(int attempt) {
        long base = RETRY_BASE_MILLIS << (attempt - 1);
        return base + ThreadLocalRandom.current().nextLong(base / 2 + 1);
    }

    private List<Map<String, Object>> fetchAllPages(OAuth2AuthorizedClient client, String baseUrl) {
        List<Map<String, Object>> items = new ArrayList<>();
        String pageToken = null;

        do {
            String url = baseUrl + (pageToken != null ? "&pageToken=" + pageToken : "");
            Map<String, Object> body = callYoutubeApi(client, url);
            List<Map<String, Object>> pageItems = (List<Map<String, Object>>) body.get("items");
            if (pageItems != null) {
                items.addAll(pageItems);
            }
            pageToken = (String) body.get("nextPageToken");
        } while (pageToken != null);

        return items;
    }

    private Map<String, Object> callYoutubeApi(OAuth2AuthorizedClient client, String url) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(client.getAccessToken().getTokenValue());
        RequestEntity<Void> request = new RequestEntity<>(headers, HttpMethod.GET, URI.create(url));
        ResponseEntity<Map> response = restTemplate.exchange(request, Map.class);
        return response.getBody();
    }

    private String extractThumbnail(Map<String, Object> thumbnails) {
        if (thumbnails == null) return null;
        Map<String, Object> medium = (Map<String, Object>) thumbnails.get("medium");
        if (medium != null) return (String) medium.get("url");
        Map<String, Object> defaultThumb = (Map<String, Object>) thumbnails.get("default");
        return defaultThumb != null ? (String) defaultThumb.get("url") : null;
    }
}
