package fm.tierlist.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

// The HTTP client PlaylistController talks to the YouTube Data API with. A bean
// (rather than a field the controller news up) so tests can point a
// MockRestServiceServer at it; deliberately a plain `new RestTemplate()`.
@Configuration
public class YoutubeConfig {

    @Bean
    public RestTemplate youtubeRestTemplate() {
        return new RestTemplate();
    }
}
