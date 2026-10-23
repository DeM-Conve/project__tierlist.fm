package fm.tierlist.config;

import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
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

    // Connections to YouTube at once. HttpClient's default (5 per host, 10 in
    // all) made the sixth of a board's six parallel playlist reads wait for a
    // whole other playlist to finish paging; a sidebar prefetch or a 4-wide
    // tier-sync running alongside queued too.
    static final int MAX_CONNECTIONS_PER_HOST = 32;
    static final int MAX_CONNECTIONS = 64;

    @Bean
    public RestTemplate youtubeRestTemplate() {
        var pool = PoolingHttpClientConnectionManagerBuilder.create()
            .useSystemProperties()
            .setMaxConnPerRoute(MAX_CONNECTIONS_PER_HOST)
            .setMaxConnTotal(MAX_CONNECTIONS)
            .build();
        var client = HttpClients.custom()
            .useSystemProperties()
            .setConnectionManager(pool)
            .build();
        return new RestTemplate(new HttpComponentsClientHttpRequestFactory(client));
    }
}
