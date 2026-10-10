package fm.tierlist.duel.engine;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ConfidentSwapOrderTest {

    private final ConfidentSwapOrder order = new ConfidentSwapOrder(0.85);

    private static SongState s(String id, double mu, double sigma) {
        return new SongState(id, "A", new Rating(mu, sigma), new double[] {1}, 0, 0, List.of(), List.of(mu));
    }

    @Test
    void keepsTheBoardOrderUnlessTheEvidenceIsStrong() {
        Map<String, SongState> songs = Map.of("x", s("x", 25, 3), "y", s("y", 26, 3), "z", s("z", 32, 1));
        // y is a bit higher than x but far from sure; z is surely above both.
        assertThat(order.order(List.of("x", "y", "z"), songs)).containsExactly("z", "x", "y");
    }

    @Test
    void unknownSongsNeverMove() {
        assertThat(order.order(List.of("a", "b"), Map.of())).containsExactly("a", "b");
        assertThat(order.surelyBetter(null, s("x", 1, 1))).isFalse();
    }
}
