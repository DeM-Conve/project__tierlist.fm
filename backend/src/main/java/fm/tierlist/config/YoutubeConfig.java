package fm.tierlist.config;

import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.util.Timeout;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

// The HTTP client PlaylistController talks to the YouTube Data API with. A bean
// (rather than a field the controller news up) so tests can point a
// MockRestServiceServer at it. Backed by Apache HttpClient 5: pooled keep-alive
// connections (a board's many sequential page requests reuse one TLS
// connection instead of a new handshake each) and gzip responses, both
// handled by the library.
// Bounded waits: HttpClient's own defaults are a 3-minute connect and no limit
// at all on a silent answer, so one stalled connection held a request (and a
// batch's writer thread) forever. A timeout is a ResourceAccessException,
// which the API answers as "Couldn't reach YouTube" (502 / per-item error).
@Configuration
public class YoutubeConfig {

    @Bean
    public RestTemplate youtubeRestTemplate(
        @Value("${app.youtube.connect-timeout:10s}") Duration connectTimeout,
        @Value("${app.youtube.read-timeout:30s}") Duration readTimeout
    ) {
        return restTemplate(connectTimeout, readTimeout);
    }

    static RestTemplate restTemplate(Duration connectTimeout, Duration readTimeout) {
        ConnectionConfig connections = ConnectionConfig.custom()
            .setConnectTimeout(Timeout.of(connectTimeout))
            .setSocketTimeout(Timeout.of(readTimeout))
            .build();
        var client = HttpClients.custom()
            .useSystemProperties() // proxy settings, as HttpClients.createSystem() (the factory's default) did
            .setConnectionManager(PoolingHttpClientConnectionManagerBuilder.create()
                .useSystemProperties()
                .setDefaultConnectionConfig(connections)
                .build())
            .setDefaultRequestConfig(RequestConfig.custom().setResponseTimeout(Timeout.of(readTimeout)).build())
            .build();
        return new RestTemplate(new HttpComponentsClientHttpRequestFactory(client));
    }
}
