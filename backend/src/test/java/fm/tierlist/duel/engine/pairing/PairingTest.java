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
    @SuppressWarnings("deprecation")
    void toDoSongsAreNeverPairedNorOpponents() {
        // Even with an old log full of to-do duels: to-do songs never enter the engine.
        List<Duel> old = new ArrayList<>();
        for (int i = 0; i < 6; i++) old.add(Boards.duel(i + 1, id("TD", 0), id("B", i), Verdict.A_CLEARLY));
        BoardAnalysis a = analyze(old, Set.of());
        for (Focus focus : List.of(Focus.SMART_MIX, Focus.BORDERLINES, Focus.PLACE_TODO)) {
            for (int i = 0; i < 20; i++) {
                engine.next(a, new SessionContext(focus, old, Set.of(), old, new Random(i)))
                    .ifPresent(m -> assertThat(Set.of(m.a(), m.b())).noneMatch(x -> x.startsWith("TD")));
            }
        }
    }

    @Test
    @SuppressWarnings("deprecation")
    void aRetiredPlaceTodoSessionPlaysAsSmartMix() {
        assertThat(Focus.PLACE_TODO.retired()).isTrue();
        assertThat(Focus.SMART_MIX.retired()).isFalse();
        BoardAnalysis a = analyze(List.of(), Set.of());
        assertThat(engine.next(a, session(Focus.PLACE_TODO, List.of(), Set.of())))
            .isEqualTo(engine.next(a, session(Focus.SMART_MIX, List.of(), Set.of())));
    }

    @Test
    void lockedAndSkippedSongsAreLeftOut() {
        Set<String> skipped = Set.of(id("B", 0), id("C", 0));
        BoardAnalysis a = analyze(List.of(), Set.of(id("B", 1)));
        for (int i = 0; i < 5; i++) {
            Matchup m = engine.next(a, new SessionContext(Focus.SMART_MIX, List.of(), skipped, List.of(), new Random(i))).orElseThrow();
            assertThat(m.a()).isNotIn(id("B", 0), id("C", 0), id("B", 1));
            assertThat(m.b()).isNotIn(id("B", 0), id("C", 0));
        }
    }

    @Test
    void equalsAreNeverAskedAgain() {
        String x = id("B", 0);
        List<Duel> log = new ArrayList<>();
        for (int i = 0; i < 3; i++) log.add(Boards.duel(i, x, id("C", 0), Verdict.TOO_CLOSE));
        BoardAnalysis a = analyze(log, Set.of());
        assertThat(a.areEquals(x, id("C", 0))).isTrue();
        for (int i = 0; i < 10; i++) {
            Optional<Matchup> m = engine.next(a, new SessionContext(Focus.SMART_MIX, List.of(), Set.of(), log, new Random(i)));
            m.ifPresent(mm -> assertThat(a.areEquals(mm.a(), mm.b())).isFalse());
        }
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
        Matchup m = Matchup.of(a, id("B", 0), id("C", 0));
        assertThat(m.a()).isEqualTo(id("B", 0));
        assertThat(m.reason().kind()).isEqualTo(Matchup.Kind.BORDER);
        assertThat(m.reason().upperTier()).isNotNull();
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
