package fm.tierlist.duel.engine;

import fm.tierlist.duel.engine.pairing.Focus;
import fm.tierlist.duel.engine.pairing.SessionContext;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

// Every duel screen waits on one analysis (each verdict, the hub, the moves
// page), so it has to stay fast on a
// big board: 333 songs (300 ranked + 33 to-do) and a long duel log.
class EngineSpeedTest {

    private static final Verdict[] VERDICTS = Verdict.values();

    static List<Duel> randomLog(BoardLayout layout, int n, long seed) {
        Random r = new Random(seed);
        List<String> ranked = layout.ranked();
        List<Duel> log = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            String a = ranked.get(r.nextInt(ranked.size()));
            String b;
            do b = ranked.get(r.nextInt(ranked.size())); while (b.equals(a));
            log.add(Boards.duel(i + 1, a, b, VERDICTS[r.nextInt(VERDICTS.length)]));
        }
        return log;
    }

    static long timeMs(Runnable run, int times) {
        long best = Long.MAX_VALUE;
        for (int i = 0; i < times; i++) {
            long t = System.nanoTime();
            run.run();
            best = Math.min(best, (System.nanoTime() - t) / 1_000_000);
        }
        return best;
    }

    @Test
    void aBigBoardWithALongLogAnalysesQuickly() {
        DuelEngine engine = DuelEngine.standard();
        BoardLayout layout = Boards.board(60, 33);
        for (int duels : new int[] {0, 300, 1000}) {
            DuelHistory history = Boards.history(engine, layout, randomLog(layout, duels, 7));
            long analyze = timeMs(() -> engine.analyze(layout, history, Boards.T0.plusSeconds(100_000)), 3);
            BoardAnalysis a = engine.analyze(layout, history, Boards.T0.plusSeconds(100_000));
            long next = timeMs(() -> engine.next(a, new SessionContext(Focus.SMART_MIX, List.of(), Set.of(),
                history.duels(), new Random(1))), 3);
            System.out.printf("ENGINE-SPEED 333 songs, %d duels: analyze %d ms, next %d ms%n", duels, analyze, next);
            assertThat(analyze).isLessThan(500);
            assertThat(next).isLessThan(250);
        }
    }
}
