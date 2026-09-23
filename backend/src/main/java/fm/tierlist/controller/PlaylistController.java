package fm.tierlist.controller;

import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.RequestEntity;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.annotation.RegisteredOAuth2AuthorizedClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
public class PlaylistController {

    private static final String YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
    private final RestTemplate restTemplate = new RestTemplate();

    @GetMapping("/api/auth/status")
    public Map<String, Object> authStatus(Authentication authentication) {
        boolean loggedIn = authentication != null
            && authentication.isAuthenticated()
            && !(authentication instanceof AnonymousAuthenticationToken);
        return Map.of("loggedIn", loggedIn);
    }

    @GetMapping("/api/playlists")
    public List<Map<String, Object>> playlists(@RegisteredOAuth2AuthorizedClient("google") OAuth2AuthorizedClient client) {
        List<Map<String, Object>> allItems = fetchAllPages(
            client,
            YOUTUBE_API_BASE + "/playlists?part=snippet,contentDetails&mine=true&maxResults=50"
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

    @GetMapping("/api/playlists/{id}/items")
    public List<Map<String, Object>> playlistItems(
            @PathVariable String id,
            @RegisteredOAuth2AuthorizedClient("google") OAuth2AuthorizedClient client
    ) {
        List<Map<String, Object>> allItems = fetchAllPages(
            client,
            YOUTUBE_API_BASE + "/playlistItems?part=snippet,contentDetails&playlistId=" + id + "&maxResults=50"
        );

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> i : allItems) {
            Map<String, Object> snippet = (Map<String, Object>) i.get("snippet");
            Map<String, Object> contentDetails = (Map<String, Object>) i.get("contentDetails");
            Map<String, Object> thumbnails = (Map<String, Object>) snippet.get("thumbnails");
            String title = (String) snippet.get("title");

            if ("Deleted video".equals(title) || "Private video".equals(title)) {
                continue;
            }

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", i.get("id")); // playlistItem id - needed to remove this item later
            out.put("videoId", contentDetails.get("videoId"));
            out.put("title", title);
            out.put("channelTitle", snippet.get("videoOwnerChannelTitle"));
            out.put("thumbnail", extractThumbnail(thumbnails));
            result.add(out);
        }
        return result;
    }

    /**
     * Moves videos between playlists: inserts into the target playlist first, then
     * removes the original playlistItem, so a failed delete never loses a video.
     * A null/blank toPlaylistId means "delete only" - used for a duplicate cleanup,
     * where the video already exists in another of this board's tier playlists and
     * this occurrence is just the redundant copy, not a real move.
     * Each entry is applied independently; failures are reported per-item rather than
     * aborting the whole batch.
     */
    @PostMapping("/api/tier-sync")
    public Map<String, Object> tierSync(
            @RequestBody List<Map<String, Object>> moves,
            @RegisteredOAuth2AuthorizedClient("google") OAuth2AuthorizedClient client
    ) {
        List<Map<String, Object>> results = new ArrayList<>();
        int applied = 0;

        for (Map<String, Object> move : moves) {
            String videoId = (String) move.get("videoId");
            String fromItemId = (String) move.get("fromItemId");
            String toPlaylistId = (String) move.get("toPlaylistId");

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("videoId", videoId);
            try {
                if (toPlaylistId != null && !toPlaylistId.isBlank()) {
                    insertPlaylistItem(client, toPlaylistId, videoId);
                }
                if (fromItemId != null) {
                    deletePlaylistItem(client, fromItemId);
                }
                result.put("success", true);
                applied++;
            } catch (Exception e) {
                result.put("success", false);
                result.put("error", e.getMessage());
            }
            results.add(result);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("applied", applied);
        response.put("total", moves.size());
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
        List<Map<String, Object>> results = new ArrayList<>();
        int applied = 0;
        for (Map<String, Object> rename : renames) {
            String id = (String) rename.get("id");
            String title = (String) rename.get("title");
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("id", id);
            result.put("title", title);
            try {
                Map<String, Object> body = callYoutubeApi(client, YOUTUBE_API_BASE + "/playlists?part=snippet&id=" + id);
                List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
                if (items == null || items.isEmpty()) throw new IllegalStateException("Playlist not found");
                Map<String, Object> snippet = new LinkedHashMap<>((Map<String, Object>) items.get(0).get("snippet"));
                Map<String, Object> newSnippet = new LinkedHashMap<>();
                newSnippet.put("title", title);
                if (snippet.get("description") != null) newSnippet.put("description", snippet.get("description"));
                if (snippet.get("defaultLanguage") != null) newSnippet.put("defaultLanguage", snippet.get("defaultLanguage"));
                sendJson(client, HttpMethod.PUT, YOUTUBE_API_BASE + "/playlists?part=snippet", Map.of("id", id, "snippet", newSnippet));
                result.put("success", true);
                applied++;
            } catch (Exception e) {
                result.put("success", false);
                result.put("error", e.getMessage());
            }
            results.add(result);
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("applied", applied);
        response.put("total", renames.size());
        response.put("results", results);
        return response;
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
        List<Map<String, Object>> results = new ArrayList<>();
        int applied = 0;
        for (Map<String, Object> playlist : playlists) {
            String title = (String) playlist.get("title");
            Object privacy = playlist.getOrDefault("privacyStatus", "private");
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("title", title);
            try {
                Map<String, Object> created = sendJson(
                    client,
                    HttpMethod.POST,
                    YOUTUBE_API_BASE + "/playlists?part=snippet,status",
                    Map.of("snippet", Map.of("title", title), "status", Map.of("privacyStatus", privacy))
                );
                result.put("id", created != null ? created.get("id") : null);
                result.put("success", true);
                applied++;
            } catch (Exception e) {
                result.put("success", false);
                result.put("error", e.getMessage());
            }
            results.add(result);
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("applied", applied);
        response.put("total", playlists.size());
        response.put("results", results);
        return response;
    }

    private Map<String, Object> sendJson(OAuth2AuthorizedClient client, HttpMethod method, String url, Map<String, Object> body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(client.getAccessToken().getTokenValue());
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<Map> response = restTemplate.exchange(url, method, new HttpEntity<>(body, headers), Map.class);
        return response.getBody();
    }

    private void insertPlaylistItem(OAuth2AuthorizedClient client, String playlistId, String videoId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(client.getAccessToken().getTokenValue());
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> resourceId = Map.of("kind", "youtube#video", "videoId", videoId);
        Map<String, Object> snippet = Map.of("playlistId", playlistId, "resourceId", resourceId);
        Map<String, Object> body = Map.of("snippet", snippet);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
        restTemplate.exchange(YOUTUBE_API_BASE + "/playlistItems?part=snippet", HttpMethod.POST, entity, Map.class);
    }

    private void deletePlaylistItem(OAuth2AuthorizedClient client, String playlistItemId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(client.getAccessToken().getTokenValue());
        HttpEntity<Void> entity = new HttpEntity<>(headers);
        restTemplate.exchange(
            YOUTUBE_API_BASE + "/playlistItems?id=" + playlistItemId,
            HttpMethod.DELETE,
            entity,
            Void.class
        );
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
