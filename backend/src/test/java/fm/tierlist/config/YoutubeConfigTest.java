package fm.tierlist.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;

class YoutubeConfigTest {

    // Apache HttpClient 5 underneath: pooled keep-alive connections and gzip,
    // so a big playlist's sequential page requests don't each pay a new TLS
    // handshake (a plain RestTemplate opens a fresh connection every time).
    @Test
    void theYoutubeClientUsesPooledApacheHttpClient() {
        assertThat(new YoutubeConfig().youtubeRestTemplate().getRequestFactory())
            .isInstanceOf(HttpComponentsClientHttpRequestFactory.class);
    }
}
