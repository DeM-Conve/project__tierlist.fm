package fm.tierlist.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.ServerSocket;
import java.net.Socket;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

class YoutubeConfigTest {

    // Apache HttpClient 5 underneath: pooled keep-alive connections and gzip,
    // so a big playlist's sequential page requests don't each pay a new TLS
    // handshake (a plain RestTemplate opens a fresh connection every time).
    @Test
    void theYoutubeClientUsesPooledApacheHttpClient() {
        assertThat(new YoutubeConfig().youtubeRestTemplate(Duration.ofSeconds(10), Duration.ofSeconds(30)).getRequestFactory())
            .isInstanceOf(HttpComponentsClientHttpRequestFactory.class);
    }

    // A server that takes the connection and never answers: the call gives
    // up after the read timeout (a ResourceAccessException - "Couldn't reach
    // YouTube") instead of hanging the request forever.
    @Test
    void aSilentServerTimesOutInsteadOfHangingForever() throws Exception {
        try (ServerSocket silent = new ServerSocket(0)) {
            Thread acceptor = Thread.ofVirtual().start(() -> {
                try (Socket ignored = silent.accept()) {
                    Thread.sleep(10_000);
                } catch (Exception done) {
                    // closed by the test
                }
            });
            RestTemplate youtube = YoutubeConfig.restTemplate(Duration.ofSeconds(2), Duration.ofMillis(300));
            long start = System.nanoTime();

            assertThatThrownBy(() -> youtube.getForObject("http://127.0.0.1:" + silent.getLocalPort() + "/v3/playlists", String.class))
                .isInstanceOf(ResourceAccessException.class);
            assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(5));
            acceptor.interrupt();
        }
    }
}
