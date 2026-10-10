package fm.tierlist.duel.engine.policy;

import fm.tierlist.duel.engine.BoardLayout;
import fm.tierlist.duel.engine.Boards;
import fm.tierlist.duel.engine.Decision;
import fm.tierlist.duel.engine.Duel;
import fm.tierlist.duel.engine.Rating;
import fm.tierlist.duel.engine.SongState;
import fm.tierlist.duel.engine.Verdict;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static fm.tierlist.duel.engine.Boards.id;
import static org.assertj.core.api.Assertions.assertThat;

class SuggestionRulesTest {

    private final BoardLayout board = Boards.board(4, 1);
    private final Map<String, String> tierOf = board.tierOf();
    private final String song = id("B", 0);

    private SongState state(List<Duel> duels) {
        return new SongState(song, "B", new Rating(30, 1), new double[] {0, 0.9, 0.1, 0, 0}, 0.3, 1, duels, List.of(30.0));
    }

    private Candidate candidate(List<Duel> duels, double confidence, Decision decision, boolean locked) {
        return new Candidate(state(duels), "B", "A", confidence, board, tierOf, decision, locked);
    }

    private List<Duel> wins(String tier, int n) {
        List<Duel> out = new ArrayList<>();
        for (int i = 0; i < n; i++) out.add(Boards.duel(i, song, id(tier, i % 4), Verdict.A));
        return out;
    }

    @Test
    void confidenceAndMinimumDuels() {
        assertThat(new ConfidenceRule(0.85).allows(candidate(List.of(), 0.9, null, false))).isTrue();
        assertThat(new ConfidenceRule(0.85).allows(candidate(List.of(), 0.8, null, false))).isFalse();
        assertThat(new MinimumDuelsRule(4).allows(candidate(wins("A", 3), 0.9, null, false))).isFalse();
        assertThat(new MinimumDuelsRule(4).allows(candidate(wins("A", 4), 0.9, null, false))).isTrue();
    }

    @Test
    void opponentsMustComeFromNearTheBorder() {
        assertThat(new BorderOpponentsRule(2).allows(candidate(wins("A", 4), 0.9, null, false))).isTrue();
        assertThat(new BorderOpponentsRule(2).allows(candidate(wins("D", 4), 0.9, null, false))).isFalse();
        Candidate todo = new Candidate(state(wins("A", 4)), null, "B", 0.9, board, tierOf, null, false);
        assertThat(todo.direction()).isZero();
        assertThat(new BorderOpponentsRule(2).allows(todo)).isTrue();
    }

    @Test
    void lockAndKeep() {
        assertThat(new NotLockedRule().allows(candidate(List.of(), 0.9, null, true))).isFalse();
        Decision kept = new Decision(Decision.Kind.KEPT, "B", "A", 4);
        assertThat(new KeepHysteresisRule(5).allows(candidate(wins("A", 8), 0.9, kept, false))).isFalse();
        assertThat(new KeepHysteresisRule(5).allows(candidate(wins("A", 9), 0.9, kept, false))).isTrue();
        Decision accepted = new Decision(Decision.Kind.ACCEPTED, "B", "A", 4);
        assertThat(new KeepHysteresisRule(5).allows(candidate(List.of(), 0.9, accepted, false))).isTrue();
    }

    @Test
    void policySortsByConfidenceAndSkipsTheCurrentTier() {
        SuggestionPolicy p = new SuggestionPolicy(List.of(c -> true));
        SongState stay = new SongState(id("C", 0), "C", new Rating(20, 1), new double[] {0, 0, 0.1, 0.9, 0}, 0.2, 3, List.of(), List.of());
        SongState up = state(wins("A", 2));
        SongState none = new SongState(id("D", 0), "D", new Rating(20, 1), new double[0], 0, 0, List.of(), List.of());
        List<Suggestion> out = p.suggest(List.of(stay, up, none), board, tierOf, Map.of(), java.util.Set.of());
        assertThat(out).extracting(Suggestion::song).containsExactly(song);
        assertThat(out.get(0).keyResults()).hasSize(2);
    }
}
