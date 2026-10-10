package fm.tierlist.duel;

import fm.tierlist.duel.engine.DuelEngine;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

// Wires the engine (the standard parts - swap any via DuelEngine.builder()).
@Configuration
class DuelConfig {

    @Bean
    DuelEngine duelEngine() {
        return DuelEngine.standard();
    }

    // Time for session limits and the duel log (replaced in tests).
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
