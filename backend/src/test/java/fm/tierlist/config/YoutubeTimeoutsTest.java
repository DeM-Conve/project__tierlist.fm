package fm.tierlist.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.ServerSocket;
import java.net.Socket;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

class YoutubeTimeoutsTest {

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
                    // interrupted by the test
                }
            });
            RestTemplate youtube = YoutubeTimeouts.apply(new YoutubeConfig().youtubeRestTemplate(), Duration.ofSeconds(2), Duration.ofMillis(300));
            long start = System.nanoTime();

            assertThatThrownBy(() -> youtube.getForObject("http://127.0.0.1:" + silent.getLocalPort() + "/v3/playlists", String.class))
                .isInstanceOf(ResourceAccessException.class);
            assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(5));
            acceptor.interrupt();
        }
    }

    // The app's own client gets them: the post-processor applies them to the
    // youtubeRestTemplate bean only.
    @Test
    void onlyTheYoutubeClientIsConfigured() {
        YoutubeTimeouts timeouts = new YoutubeTimeouts(Duration.ofSeconds(10), Duration.ofSeconds(30));
        RestTemplate youtube = new YoutubeConfig().youtubeRestTemplate();
        Object other = new Object();

        assertThat(timeouts.postProcessAfterInitialization(youtube, "youtubeRestTemplate")).isSameAs(youtube);
        assertThat(timeouts.postProcessAfterInitialization(other, "somethingElse")).isSameAs(other);
    }
}
