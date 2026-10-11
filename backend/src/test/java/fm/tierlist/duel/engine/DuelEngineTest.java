package fm.tierlist.duel.engine;

import fm.tierlist.duel.engine.policy.Suggestion;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static fm.tierlist.duel.engine.Boards.duel;
import static fm.tierlist.duel.engine.Boards.id;
import static org.assertj.core.api.Assertions.assertThat;

class DuelEngineTest {

    private final DuelEngine engine = DuelEngine.standard();
    private final BoardLayout board = Boards.board(6, 3);

    private BoardAnalysis analyze(List<Duel> log) {
        return engine.analyze(board, Boards.history(engine, board, log), Boards.T0.plusSeconds(10_000));
    }

    // `song` beats a different song from `tier` each time, clearly.
    private static List<Duel> beats(String song, String tier, int times) {
        List<Duel> log = new ArrayList<>();
        for (int i = 0; i < times; i++) log.add(duel(i + 1, song, id(tier, i % 6), Verdict.A_CLEARLY));
        return log;
    }

    @Test
    void untouchedBoardIsUnsureButSuggestsNothing() {
        BoardAnalysis a = analyze(List.of());
        assertThat(a.certainty()).isBetween(0.3, 0.95);
        assertThat(a.suggestions()).isEmpty();
        assertThat(a.songs()).hasSize(30);
        assertThat(a.song(id("TD", 0))).isNull();
        assertThat(a.cutpoints()).hasSize(4);
        assertThat(a.tierOrders()).isEmpty();
    }

    @Test
    void aSongThatKeepsBeatingTheTierAboveIsSuggestedAMoveUp() {
        String song = id("A", 3);
        BoardAnalysis a = analyze(beats(song, "S", 6));
        Suggestion s = a.suggestions().stream().filter(x -> x.song().equals(song)).findFirst().orElseThrow();
        assertThat(s.from()).isEqualTo("A");
        assertThat(s.to()).isEqualTo("S");
        assertThat(s.confidence()).isGreaterThanOrEqualTo(0.85);
        assertThat(s.wins()).isEqualTo(6);
        assertThat(s.keyResults()).hasSize(4);
        assertThat(s.trend()).hasSize(7); // the prior + one point per duel
    }

    // The bug behind "I have never seen a suggested move": a move into a middle
    // tier was gated on P(exactly that tier), which a ~6-point-wide tier caps
    // near 80% - this song beat six B songs clearly and was never suggested.
    @Test
    void aMiddleTierSongThatKeepsBeatingTheTierAboveIsSuggestedAMoveUp() {
        String song = id("C", 3);
        BoardAnalysis a = analyze(beats(song, "B", 6));
        Suggestion s = a.suggestions().stream().filter(x -> x.song().equals(song)).findFirst().orElseThrow();
        assertThat(s.from()).isEqualTo("C");
        assertThat(s.to()).isEqualTo("B");
        assertThat(s.confidence()).isGreaterThanOrEqualTo(0.85);
        assertThat(s.unmet()).isEmpty();
    }

    @Test
    void oneUpsetMovesScoresNeverTiers() {
        BoardAnalysis a = analyze(List.of(duel(1, id("D", 0), id("S", 0), Verdict.A_CLEARLY)));
        assertThat(a.suggestions()).isEmpty();
        assertThat(a.winnerOdds().get(1L)).isLessThan(0.5);
    }

    // The user's call: to-do songs are never part of duels - the user places
    // them. Old duels with a song now on the to-do list (from the retired Place
    // TODO mode) don't crash anything: they're left out of the analysis.
    @Test
    void toDoSongsNeverEnterTheEngineEvenWithStrongDuels() {
        String song = id("TD", 0);
        List<Duel> log = new ArrayList<>();
        for (int i = 0; i < 8; i++) log.add(duel(i + 1, song, id("A", i % 6), Verdict.A_CLEARLY));
        log.add(duel(20, id("TD", 1), id("TD", 2), Verdict.A_CLEARLY));
        BoardAnalysis a = analyze(log);
        assertThat(a.song(song)).isNull();
        assertThat(a.songs().keySet()).noneMatch(x -> x.startsWith("TD"));
        assertThat(a.suggestions()).noneMatch(s -> s.song().startsWith("TD"));
        assertThat(a.leaning()).noneMatch(s -> s.song().startsWith("TD"));
        assertThat(a.tierOrders().values()).allSatisfy(ids -> assertThat(ids).noneMatch(x -> x.startsWith("TD")));
        assertThat(a.onFence()).noneMatch(x -> x.startsWith("TD"));
        assertThat(a.winnerOdds()).isEmpty();
        // Its opponents score as if those duels never happened.
        BoardAnalysis clean = analyze(List.of());
        assertThat(a.song(id("A", 0)).rating().mu()).isCloseTo(clean.song(id("A", 0)).rating().mu(), org.assertj.core.api.Assertions.within(1e-9));
        assertThat(a.certainty()).isCloseTo(clean.certainty(), org.assertj.core.api.Assertions.within(1e-9));
        // No starting score either.
        assertThat(engine.newPriors(board, Map.of())).doesNotContainKey(song);
    }

    @Test
    void aToDoSongMovedIntoATierJoinsTheEngineWithItsDuels() {
        String song = id("TD", 0);
        List<Duel> log = new ArrayList<>();
        for (int i = 0; i < 4; i++) log.add(duel(i + 1, song, id("A", i), Verdict.A_CLEARLY));
        Map<String, List<String>> songs = new java.util.LinkedHashMap<>(board.songs());
        List<String> c = new ArrayList<>(songs.get("C"));
        c.add(song);
        songs.put("C", c);
        BoardLayout placed = new BoardLayout(board.rankedTiers(), "TODO", songs);
        BoardAnalysis a = engine.analyze(placed, Boards.history(engine, placed, log), Boards.T0.plusSeconds(10_000));
        assertThat(a.song(song).tier()).isEqualTo("C");
        assertThat(a.song(song).duels()).hasSize(4);
        assertThat(placed.toDo()).doesNotContain(song).contains(id("TD", 1));
    }

    @Test
    void lockedSongsAreNeverSuggested() {
        String song = id("A", 3);
        BoardAnalysis a = engine.analyze(board, new DuelHistory(engine.newPriors(board, Map.of()), beats(song, "S", 6), Map.of(), Set.of(song)),
            Boards.T0.plusSeconds(10_000));
        assertThat(a.suggestions()).noneMatch(s -> s.song().equals(song));
    }

    @Test
    void keepRaisesTheBarUntilFiveFreshDuelsAgree() {
        String song = id("A", 3);
        Map<String, Decision> kept = Map.of(song, new Decision(Decision.Kind.KEPT, "A", "S", 6));
        List<Duel> log = new ArrayList<>(beats(song, "S", 6));
        BoardAnalysis before = engine.analyze(board, new DuelHistory(engine.newPriors(board, Map.of()), log, kept, Set.of()), Boards.T0.plusSeconds(10_000));
        assertThat(before.suggestions()).noneMatch(s -> s.song().equals(song));
        for (int i = 0; i < 5; i++) log.add(duel(100 + i, song, id("S", i), Verdict.A));
        BoardAnalysis after = engine.analyze(board, new DuelHistory(engine.newPriors(board, Map.of()), log, kept, Set.of()), Boards.T0.plusSeconds(10_000));
        assertThat(after.suggestions()).anyMatch(s -> s.song().equals(song));
    }

    @Test
    void threeStraightDrawsMakeEquals() {
        String x = id("B", 0);
        String y = id("B", 1);
        BoardAnalysis a = analyze(List.of(duel(1, x, y, Verdict.TOO_CLOSE), duel(2, y, x, Verdict.TOO_CLOSE), duel(3, x, y, Verdict.TOO_CLOSE)));
        assertThat(a.areEquals(y, x)).isTrue();
        BoardAnalysis b = analyze(List.of(duel(1, x, y, Verdict.TOO_CLOSE), duel(2, y, x, Verdict.A), duel(3, x, y, Verdict.TOO_CLOSE)));
        assertThat(b.areEquals(x, y)).isFalse();
    }

    @Test
    void aTierIsReorderedOnlyOnStrongEvidence() {
        List<Duel> strong = new ArrayList<>();
        for (int i = 0; i < 4; i++) strong.add(duel(i + 1, id("C", 5), id("C", 4), Verdict.A_CLEARLY));
        BoardAnalysis a = analyze(strong);
        assertThat(a.tierOrders()).containsKey("C");
        assertThat(a.tierOrders().get("C").indexOf(id("C", 5))).isLessThan(5);
    }

    @Test
    void aFewDrawsNeverReshuffleATier() {
        BoardAnalysis a = analyze(List.of(duel(1, id("B", 5), id("B", 0), Verdict.TOO_CLOSE), duel(2, id("B", 4), id("B", 1), Verdict.TOO_CLOSE),
            duel(3, id("B", 3), id("B", 0), Verdict.A)));
        assertThat(a.tierOrders()).doesNotContainKey("B");
    }

    @Test
    void theOrderDuelsHappenedInDoesNotMatter() {
        List<Duel> log = beats(id("A", 3), "S", 3);
        log.add(duel(50, id("C", 1), id("B", 2), Verdict.A));
        List<Duel> reversed = new ArrayList<>(log);
        java.util.Collections.reverse(reversed);
        assertThat(analyze(log).song(id("A", 3)).rating().mu())
            .isCloseTo(analyze(reversed).song(id("A", 3)).rating().mu(), org.assertj.core.api.Assertions.within(1e-6));
    }

    @Test
    void duelsMakeASongMoreCertain() {
        BoardAnalysis a = analyze(beats(id("C", 3), "C", 4));
        assertThat(a.song(id("C", 3)).rating().sigma()).isLessThan(a.song(id("C", 4)).rating().sigma());
    }

    @Test
    void probabilityOfCurrentTierAndFence() {
        BoardAnalysis a = analyze(beats(id("A", 3), "S", 2));
        SongState s = a.song(id("A", 3));
        assertThat(a.probabilityOfCurrentTier(s)).isEqualTo(s.probabilities()[1]);
        assertThat(a.onFence()).isNotEmpty();
    }

    @Test
    void builderSwapsParts() {
        DuelEngine custom = DuelEngine.builder().config(EngineConfig.defaults()).tierModel(new OrdinalProbitTierModel()).build();
        assertThat(custom.config()).isEqualTo(EngineConfig.defaults());
        assertThat(custom.ratingModel()).isInstanceOf(WengLinBradleyTerry.class);
    }
}
