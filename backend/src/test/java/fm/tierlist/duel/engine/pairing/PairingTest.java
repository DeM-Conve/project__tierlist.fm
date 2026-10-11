package fm.tierlist.duel.engine.pairing;

import fm.tierlist.duel.engine.BoardAnalysis;
import fm.tierlist.duel.engine.BoardLayout;
import fm.tierlist.duel.engine.Boards;
import fm.tierlist.duel.engine.Duel;
import fm.tierlist.duel.engine.DuelEngine;
import fm.tierlist.duel.engine.DuelHistory;
import fm.tierlist.duel.engine.Verdict;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.Set;

import static fm.tierlist.duel.engine.Boards.id;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PairingTest {

    private final DuelEngine engine = DuelEngine.standard();
    private final BoardLayout board = Boards.board(6, 3);

    private BoardAnalysis analyze(List<Duel> log, Set<String> locks) {
        return engine.analyze(board, new DuelHistory(engine.newPriors(board, Map.of()), log, Map.of(), locks), Boards.T0.plusSeconds(10_000));
    }

    private SessionContext session(Focus focus, List<Duel> mine, Set<String> skipped) {
        return new SessionContext(focus, mine, skipped, mine, new Random(7));
    }

    @Test
    void smartMixPairsAnUncertainSongWithARankedOpponentNearItsBorder() {
        BoardAnalysis a = analyze(List.of(), Set.of());
        Matchup m = engine.next(a, session(Focus.SMART_MIX, List.of(), Set.of())).orElseThrow();
        assertThat(m.a()).isNotEqualTo(m.b());
        assertThat(a.song(m.b()).tier()).isNotNull();
        assertThat(m.reason().kind()).isEqualTo(Matchup.Kind.BORDER);
        assertThat(m.reason().upperTier()).isNotNull();
    }

    @Test
    void smartMixAndBorderlinesNeverBringInToDoSongs() {
        BoardAnalysis a = analyze(List.of(), Set.of());
        for (Focus focus : List.of(Focus.SMART_MIX, Focus.BORDERLINES)) {
            for (int i = 0; i < 20; i++) {
                engine.next(a, new SessionContext(focus, List.of(), Set.of(), List.of(), new Random(i)))
                    .ifPresent(m -> assertThat(Set.of(m.a(), m.b())).noneMatch(id -> id.startsWith("TD")));
            }
        }
    }

    @Test
    void lockedAndSkippedSongsAreLeftOut() {
        Set<String> skipped = Set.of(id("TD", 0), id("TD", 1));
        BoardAnalysis a = analyze(List.of(), Set.of(id("TD", 2)));
        for (int i = 0; i < 5; i++) {
            Matchup m = engine.next(a, new SessionContext(Focus.SMART_MIX, List.of(), skipped, List.of(), new Random(i))).orElseThrow();
            assertThat(Set.of(m.a(), m.b())).doesNotContainAnyElementsOf(Set.of(id("TD", 0), id("TD", 1), id("TD", 2)));
        }
    }

    @Test
    void equalsAreNeverAskedAgain() {
        String x = id("TD", 0);
        List<Duel> log = new ArrayList<>();
        for (int i = 0; i < 3; i++) log.add(Boards.duel(i, x, id("C", 0), Verdict.TOO_CLOSE));
        BoardAnalysis a = analyze(log, Set.of());
        for (int i = 0; i < 10; i++) {
            Optional<Matchup> m = engine.next(a, new SessionContext(Focus.SMART_MIX, List.of(), Set.of(), log, new Random(i)));
            m.ifPresent(mm -> assertThat(a.areEquals(mm.a(), mm.b())).isFalse());
        }
    }

    @Test
    void placeTodoTakesToDoSongsInOrderAndStaysOnOneUntilPlaced() {
        BoardAnalysis a = analyze(List.of(), Set.of());
        Matchup first = engine.next(a, session(Focus.PLACE_TODO, List.of(), Set.of())).orElseThrow();
        assertThat(first.a()).isEqualTo(id("TD", 0));
        assertThat(first.reason().kind()).isEqualTo(Matchup.Kind.PLACE);
        List<Duel> mine = List.of(Boards.duel(1, first.a(), first.b(), Verdict.A));
        BoardAnalysis after = analyze(mine, Set.of());
        assertThat(engine.next(after, session(Focus.PLACE_TODO, mine, Set.of())).orElseThrow().a()).isEqualTo(id("TD", 0));
        assertThat(engine.next(after, session(Focus.PLACE_TODO, mine, Set.of(id("TD", 0)))).orElseThrow().a()).isEqualTo(id("TD", 1));
    }

    @Test
    void placeTodoMovesOnAfterTheCap() {
        List<Duel> mine = new ArrayList<>();
        for (int i = 0; i < 12; i++) mine.add(Boards.duel(i, id("TD", 0), id("B", i % 6), Verdict.TOO_CLOSE));
        BoardAnalysis a = analyze(mine, Set.of());
        assertThat(engine.next(a, session(Focus.PLACE_TODO, mine, Set.of())).orElseThrow().a()).isEqualTo(id("TD", 1));
    }

    @Test
    void placeTodoWithNothingToPlace() {
        BoardLayout noTodo = Boards.board(4, 0);
        BoardAnalysis a = engine.analyze(noTodo, Boards.history(engine, noTodo, List.of()), Boards.T0);
        assertThat(engine.next(a, session(Focus.PLACE_TODO, List.of(), Set.of()))).isEmpty();
    }

    @Test
    void borderlinesOnlySettlesSongsOnTheFence() {
        BoardAnalysis a = analyze(List.of(), Set.of());
        engine.next(a, session(Focus.BORDERLINES, List.of(), Set.of()))
            .ifPresent(m -> assertThat(a.onFence()).contains(m.a()));
    }

    @Test
    void theSongJustHeardTendsToStay() {
        BoardAnalysis a = analyze(List.of(), Set.of());
        Matchup first = engine.next(a, session(Focus.SMART_MIX, List.of(), Set.of())).orElseThrow();
        List<Duel> mine = List.of(Boards.duel(1, first.a(), first.b(), Verdict.TOO_CLOSE));
        Matchup second = engine.next(analyze(mine, Set.of()), session(Focus.SMART_MIX, mine, Set.of())).orElseThrow();
        assertThat(second.b()).isNotEqualTo(first.b());
    }

    @Test
    void rematchExplainsTheSamePair() {
        BoardAnalysis a = analyze(List.of(), Set.of());
        Matchup m = Matchup.of(a, id("TD", 0), id("B", 0));
        assertThat(m.reason().kind()).isEqualTo(Matchup.Kind.PLACE);
        assertThat(Matchup.of(a, id("B", 0), id("C", 0)).reason().kind()).isEqualTo(Matchup.Kind.BORDER);
    }

    @Test
    void registryRejectsAnUnknownFocus() {
        PairingStrategies empty = new PairingStrategies(Map.of());
        assertThatThrownBy(() -> empty.forFocus(Focus.SMART_MIX)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void sessionContextHelpers() {
        String x = id("A", 0);
        List<Duel> mine = List.of(Boards.duel(1, id("B", 0), x, Verdict.A), Boards.duel(2, x, id("C", 0), Verdict.A), Boards.duel(3, x, id("C", 1), Verdict.A));
        SessionContext s = session(Focus.SMART_MIX, mine, Set.of());
        assertThat(s.lastSubject()).isEqualTo(x);
        assertThat(s.run(x)).isEqualTo(2);
        assertThat(s.sessionDuelsWith(x)).isEqualTo(3);
        assertThat(session(Focus.SMART_MIX, List.of(), Set.of()).lastSubject()).isNull();
    }

    @Test
    void noBordersNoBorderDuels() {
        BoardLayout one = new BoardLayout(List.of("S"), "TODO", Map.of("S", List.of(id("S", 0), id("S", 1)), "TODO", List.of()));
        BoardAnalysis a = engine.analyze(one, Boards.history(engine, one, List.of()), Boards.T0);
        assertThat(engine.next(a, session(Focus.SMART_MIX, List.of(), Set.of()))).isEmpty();
        assertThat(PairScoring.nearestBorder(new double[0], 3)).isEqualTo(-1);
        assertThat(PairScoring.borderReason(a, -1, Matchup.Kind.BORDER).upperTier()).isNull();
    }
}
