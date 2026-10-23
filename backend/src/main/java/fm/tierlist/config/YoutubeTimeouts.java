package fm.tierlist.config;

import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.protocol.HttpClientContext;
import org.apache.hc.core5.util.Timeout;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

// Bounded waits on every YouTube call (YoutubeConfig's client). HttpClient's
// own defaults are a 3-minute connect and no limit at all on a silent answer,
// so one stalled connection held a request - and a batch's writer thread -
// forever. A timeout is a ResourceAccessException, which the API answers as
// "Couldn't reach YouTube" (a 502, or a batch item's error). Kept apart from
// YoutubeConfig's pool settings: it only sets each request's timeouts.
@Component
class YoutubeTimeouts implements BeanPostProcessor {

    private final Duration connectTimeout;
    private final Duration readTimeout;

    YoutubeTimeouts(@Value("${app.youtube.connect-timeout:10s}") Duration connectTimeout,
                    @Value("${app.youtube.read-timeout:30s}") Duration readTimeout) {
        this.connectTimeout = connectTimeout;
        this.readTimeout = readTimeout;
    }

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        if ("youtubeRestTemplate".equals(beanName) && bean instanceof RestTemplate youtube) {
            apply(youtube, connectTimeout, readTimeout);
        }
        return bean;
    }

    static RestTemplate apply(RestTemplate youtube, Duration connectTimeout, Duration readTimeout) {
        if (youtube.getRequestFactory() instanceof HttpComponentsClientHttpRequestFactory factory) {
            @SuppressWarnings("deprecation") // per-request connect timeout: still honoured by HttpClient 5
            RequestConfig config = RequestConfig.custom()
                .setConnectTimeout(Timeout.of(connectTimeout))
                .setResponseTimeout(Timeout.of(readTimeout))
                .build();
            factory.setHttpContextFactory((method, uri) -> {
                HttpClientContext context = HttpClientContext.create();
                context.setRequestConfig(config);
                return context;
            });
        }
        return youtube;
    }
}
