package fm.tierlist.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

class YoutubeConfigTest {

    // Apache HttpClient 5 underneath: pooled keep-alive connections and gzip,
    // so a big playlist's sequential page requests don't each pay a new TLS
    // handshake (a plain RestTemplate opens a fresh connection every time).
    @Test
    void theYoutubeClientUsesPooledApacheHttpClient() {
        assertThat(new YoutubeConfig().youtubeRestTemplate().getRequestFactory())
            .isInstanceOf(HttpComponentsClientHttpRequestFactory.class);
    }

    // Opening a board reads its six tier playlists at once (plus a sidebar
    // prefetch or a 4-wide tier-sync alongside). HttpClient's default pool
    // allows 5 connections to one host, so the sixth read used to wait for a
    // whole other playlist's paging to finish before it started.
    @Test
    void sixPlaylistReadsAtOnceRunInParallel() throws Exception {
        long delayMs = 400;
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        ExecutorService serverThreads = Executors.newFixedThreadPool(16);
        server.setExecutor(serverThreads);
        server.createContext("/", exchange -> {
            try {
                Thread.sleep(delayMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            byte[] body = "{}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        ExecutorService callers = Executors.newFixedThreadPool(8);
        try {
            RestTemplate youtube = new YoutubeConfig().youtubeRestTemplate();
            String url = "http://127.0.0.1:" + server.getAddress().getPort() + "/playlistItems";
            long start = System.nanoTime();
            List<CompletableFuture<String>> reads = IntStream.range(0, 6)
                .mapToObj(i -> CompletableFuture.supplyAsync(() -> youtube.getForObject(url, String.class), callers))
                .toList();
            reads.forEach(CompletableFuture::join);
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;
            // One round of the server's delay, not two.
            assertThat(elapsedMs).isLessThan(delayMs * 2 - 100);
        } finally {
            callers.shutdownNow();
            server.stop(0);
            serverThreads.shutdownNow();
        }
    }
}
