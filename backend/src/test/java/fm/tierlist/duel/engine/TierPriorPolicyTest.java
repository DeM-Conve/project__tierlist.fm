package fm.tierlist.duel.engine;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class TierPriorPolicyTest {

    private final TierPriorPolicy policy = new TierPriorPolicy(6, 3.5, new WengLinBradleyTerry(0.25));

    @Test
    void tiersAreOrderedBandsAndTheirOrderIsKept() {
        BoardLayout b = Boards.board(3, 2);
        Map<String, Rating> p = policy.priorsFor(b, Map.of());
        assertThat(p.get(Boards.id("S", 2)).mu()).isGreaterThan(p.get(Boards.id("A", 0)).mu());
        assertThat(p.get(Boards.id("A", 0)).mu()).isGreaterThan(p.get(Boards.id("A", 1)).mu());
        assertThat(p.get(Boards.id("A", 0)).sigma()).isEqualTo(3.5);
    }

    @Test
    void todoSongsStartAtTheMeanCompletelyUnsure() {
        Map<String, Rating> p = policy.priorsFor(Boards.board(3, 2), Map.of());
        assertThat(p.get(Boards.id("TD", 0)).mu()).isEqualTo(25, org.assertj.core.api.Assertions.within(1e-9));
        assertThat(p.get(Boards.id("TD", 0)).sigma()).isEqualTo(WengLinBradleyTerry.SIGMA);
    }

    @Test
    void existingPriorsAreNeverReplaced() {
        Map<String, Rating> p = policy.priorsFor(Boards.board(1, 0), Map.of(Boards.id("S", 0), new Rating(1, 1)));
        assertThat(p).doesNotContainKey(Boards.id("S", 0)).hasSize(4);
    }

    @Test
    void cutpointsSitBetweenCentres() {
        double[] c = policy.cutpointPriors(5);
        assertThat(c).containsExactly(34, 28, 22, 16);
        assertThat(policy.cutpointPriors(1)).isEmpty();
    }

    @Test
    void emptyBoard() {
        BoardLayout b = new BoardLayout(Boards.TIERS, "TODO", Map.of("TODO", java.util.List.of(Boards.id("TD", 0))));
        assertThat(policy.priorsFor(b, Map.of()).get(Boards.id("TD", 0)).mu()).isEqualTo(25);
    }
}
