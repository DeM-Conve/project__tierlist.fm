package fm.tierlist.config;

import fm.tierlist.user.AppUserService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.json.ProblemDetailJacksonMixin;
import org.springframework.security.core.AuthenticationException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.http.HttpStatus;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.io.IOException;
import java.net.URI;
import java.util.List;

@Configuration
public class SecurityConfig {

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, AppUserService users) throws Exception {
        // After Google login: record the user (app_user), then back to the app.
        SimpleUrlAuthenticationSuccessHandler toFrontend = new SimpleUrlAuthenticationSuccessHandler(frontendUrl);
        toFrontend.setAlwaysUseDefaultTargetUrl(true);

        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/status").permitAll()
                .requestMatchers("/api/**").authenticated()
                .anyRequest().permitAll()
            )
            .exceptionHandling(ex -> ex
                .defaultAuthenticationEntryPointFor(
                    SecurityConfig::notLoggedIn,
                    // The path inside the app: behind a sub-path the request URI
                    // carries the proxy's X-Forwarded-Prefix (/tierlist.fm/api/...)
                    // as its context path.
                    request -> request.getRequestURI().substring(request.getContextPath().length()).startsWith("/api/")
                )
            )
            .oauth2Login(oauth2 -> oauth2
                .successHandler((request, response, authentication) -> {
                    users.recordLogin(authentication);
                    toFrontend.onAuthenticationSuccess(request, response, authentication);
                })
            )
            .logout(logout -> logout
                .logoutUrl("/api/auth/logout")
                .logoutSuccessHandler((request, response, authentication) -> response.setStatus(HttpStatus.OK.value()))
            );

        return http.build();
    }

    private static final ObjectMapper JSON = new ObjectMapper().addMixIn(ProblemDetail.class, ProblemDetailJacksonMixin.class);

    // A signed-out API call: 401 with an RFC 9457 ProblemDetail (like every
    // other API error), never a redirect to Google's login page - for every
    // method, so a POST can't end up following the redirect as a GET.
    static void notLoggedIn(HttpServletRequest request, HttpServletResponse response, AuthenticationException e) throws IOException {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "You're not logged in (or your login expired) - log in again.");
        problem.setInstance(URI.create(request.getRequestURI()));
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        JSON.writeValue(response.getOutputStream(), problem);
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(originOf(frontendUrl)));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        // The settings API's version travels as an ETag the frontend must read.
        configuration.setExposedHeaders(List.of("ETag"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    // An Origin is scheme://host[:port] only, so a frontend URL with a sub-path
    // (http://localhost/tierlist.fm) is allowed as http://localhost.
    static String originOf(String url) {
        URI uri = URI.create(url);
        return uri.getScheme() + "://" + uri.getRawAuthority();
    }
}
