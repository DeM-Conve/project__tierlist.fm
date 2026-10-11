package fm.tierlist.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

// The HTTP client PlaylistController talks to the YouTube Data API with. A bean
// (rather than a field the controller news up) so tests can point a
// MockRestServiceServer at it. Backed by Apache HttpClient 5: pooled keep-alive
// connections (a board's many sequential page requests reuse one TLS
// connection instead of a new handshake each) and gzip responses, both
// handled by the library.
@Configuration
public class YoutubeConfig {

    @Bean
    public RestTemplate youtubeRestTemplate() {
        return new RestTemplate(new HttpComponentsClientHttpRequestFactory());
    }
}
