package fm.tierlist;

import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;

// Base for integration tests: the whole app (Flyway + Hibernate `validate`,
// security, MVC) against one real Postgres 17, shared by every subclass - one
// container and one Spring context for all of them (started once, stopped by
// Testcontainers when the JVM exits).
@SpringBootTest(properties = {
    "spring.security.oauth2.client.registration.google.client-id=test",
    "spring.security.oauth2.client.registration.google.client-secret=test",
})
@AutoConfigureMockMvc
public abstract class PostgresIT {

    @ServiceConnection
    protected static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");

    static {
        postgres.start();
    }
}
