package fm.tierlist.duel.engine;

import fm.tierlist.duel.engine.pairing.Focus;
import fm.tierlist.duel.engine.pairing.Matchup;
import fm.tierlist.duel.engine.pairing.SessionContext;
import fm.tierlist.duel.engine.policy.Suggestion;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.Set;

import static fm.tierlist.duel.engine.Boards.id;
import static org.assertj.core.api.Assertions.assertThat;

// End to end through the engine: a simulated listener with a "true" ranking
// answers the duels the engine asks for. The board files one song a tier too
// low and one a tier too high; Smart mix should find both within a session or
// two - and suggest nothing else.
class SimulatedListenerTest {

    private final DuelEngine engine = DuelEngine.standard();

    // Board order is the truth, except A_2 truly belongs at the top of S and S_3 in the middle of A.
    private static Map<String, Double> truth(BoardLayout board) {
        Map<String, Double> score = new HashMap<>();
        List<String> ranked = board.ranked();
        for (int i = 0; i < ranked.size(); i++) score.put(ranked.get(i), (double) -i);
        score.put(id("A", 2), 1.0);
        score.put(id("S", 3), -7.5); // the middle of A
        // To-do songs: TD_0 truly belongs mid-B, TD_1 mid-D.
        score.put(id("TD", 0), -14.5);
        score.put(id("TD", 1), -26.5);
        return score;
    }

    private static Verdict answer(double a, double b) {
        double gap = a - b;
        if (Math.abs(gap) < 1.5) return Verdict.TOO_CLOSE;
        if (Math.abs(gap) >= 6) return gap > 0 ? Verdict.A_CLEARLY : Verdict.B_CLEARLY;
        return gap > 0 ? Verdict.A : Verdict.B;
    }

    private List<Suggestion> run(Focus focus, int duels, long seed) {
        return run(Boards.board(6, 0), focus, duels, seed);
    }

    private List<Suggestion> run(BoardLayout board, Focus focus, int duels, long seed) {
        Map<String, Double> truth = truth(board);
        Map<String, Rating> priors = engine.newPriors(board, Map.of());
        List<Duel> log = new ArrayList<>();
        Random random = new Random(seed);
        BoardAnalysis a = null;
        for (int n = 0; n < duels; n++) {
            a = engine.analyze(board, new DuelHistory(priors, log, Map.of(), Set.of()), Boards.T0.plusSeconds(n + 1000));
            Optional<Matchup> m = engine.next(a, new SessionContext(focus, log, Set.of(), log, random));
            if (m.isEmpty()) break;
            log.add(Boards.duel(n + 1, m.get().a(), m.get().b(), answer(truth.get(m.get().a()), truth.get(m.get().b()))));
        }
        a = engine.analyze(board, new DuelHistory(priors, log, Map.of(), Set.of()), Boards.T0.plusSeconds(5000));
        return a.suggestions();
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(longs = {1, 2, 3, 42, 99})
    void smartMixFindsBothMisfiledSongsAndNothingElse(long seed) {
        List<Suggestion> moves = run(Focus.SMART_MIX, 60, seed);
        assertThat(moves).extracting(Suggestion::song).contains(id("A", 2), id("S", 3));
        assertThat(moves).allMatch(s -> Set.of(id("A", 2), id("S", 3)).contains(s.song())
            || Math.abs(Boards.TIERS.indexOf(s.from()) - Boards.TIERS.indexOf(s.to())) == 1);
        Suggestion up = moves.stream().filter(s -> s.song().equals(id("A", 2))).findFirst().orElseThrow();
        assertThat(up.to()).isEqualTo("S");
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(longs = {1, 2, 3})
    void placeTodoPutsEachToDoSongInItsTrueTier(long seed) {
        List<Suggestion> moves = run(Boards.board(6, 2), Focus.PLACE_TODO, 30, seed);
        assertThat(moves).filteredOn(s -> s.song().equals(id("TD", 0))).extracting(Suggestion::to).containsExactly("B");
        assertThat(moves).filteredOn(s -> s.song().equals(id("TD", 1))).extracting(Suggestion::to).containsExactly("D");
    }
}
