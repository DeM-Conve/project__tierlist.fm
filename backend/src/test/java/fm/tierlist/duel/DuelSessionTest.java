package fm.tierlist.duel;

import fm.tierlist.duel.engine.pairing.Focus;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class DuelSessionTest {

    private final Instant t0 = Instant.parse("2026-10-01T12:00:00Z");

    @Test
    void openUntilItsLengthIsUpOrItEnds() {
        DuelSession s = new DuelSession("u", "Rap", Focus.SMART_MIX, 5, t0, 0.6);
        assertThat(s.endsAt()).isEqualTo(t0.plusSeconds(300));
        assertThat(s.isOpen(t0.plusSeconds(299))).isTrue();
        assertThat(s.isOpen(t0.plusSeconds(300))).isFalse();
        s.end(t0.plusSeconds(60));
        assertThat(s.isOpen(t0.plusSeconds(61))).isFalse();
    }

    @Test
    void endingKeepsTheFirstEndAndNeverEndsBeforeItStarted() {
        DuelSession s = new DuelSession("u", "Rap", Focus.BORDERLINES, 2, t0, 0.5);
        s.end(t0.minusSeconds(10));
        assertThat(s.getEndedAt()).isEqualTo(t0);
        s.end(t0.plusSeconds(90));
        assertThat(s.getEndedAt()).isEqualTo(t0);
        assertThat(s.getMinutes()).isEqualTo(2);
        assertThat(s.getCertaintyStart()).isEqualTo(0.5, org.assertj.core.api.Assertions.within(1e-6));
    }
}
