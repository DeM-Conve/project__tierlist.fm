package fm.tierlist.duel.engine;

import fm.tierlist.duel.engine.pairing.Focus;
import fm.tierlist.duel.engine.pairing.SessionContext;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

// A big board (333 ranked songs + a to-do list, 1,500 duels in the log, with
// learned and with fixed borders) is analysed - and its next duel paired - well
// inside an interactive budget. Every duel page call runs one or two of these.
class BigBoardPerformanceTest {

    private static final int SONGS_PER_TIER = 67; // 335 ranked songs
    private static final int DUELS = 1500;

    private static List<Duel> randomLog(BoardLayout layout, int n, long seed) {
        Random r = new Random(seed);
        List<String> ranked = layout.ranked();
        Verdict[] verdicts = Verdict.values();
        List<Duel> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            String a = ranked.get(r.nextInt(ranked.size()));
            String b = ranked.get(r.nextInt(ranked.size()));
            if (a.equals(b)) continue;
            out.add(Boards.duel(i, a, b, verdicts[r.nextInt(verdicts.length)]));
        }
        return out;
    }

    private static long timeMillis(Runnable r) {
        long start = System.nanoTime();
        r.run();
        return (System.nanoTime() - start) / 1_000_000;
    }

    @Test
    void analysingAndPairingA333SongBoardIsFast() {
        BoardLayout layout = Boards.board(SONGS_PER_TIER, 40);
        List<Duel> log = randomLog(layout, DUELS, 7);
        Map<String, Double> lower = new HashMap<>(Map.of("S", 33.95, "A", 27.95, "B", 21.95, "C", 15.95));
        DuelEngine learned = DuelEngine.standard();
        DuelEngine fixed = learned.withTierModel(new FixedCutpointsTierModel(lower, learned.tierModel()));
        DuelHistory history = Boards.history(learned, layout, log);

        // Warm up the JIT, then take the best of a few runs (CI noise).
        for (int i = 0; i < 3; i++) learned.analyze(layout, history, Boards.T0.plusSeconds(DUELS));
        long best = Long.MAX_VALUE;
        long bestFixed = Long.MAX_VALUE;
        long bestPair = Long.MAX_VALUE;
        for (int i = 0; i < 5; i++) {
            best = Math.min(best, timeMillis(() -> learned.analyze(layout, history, Boards.T0.plusSeconds(DUELS))));
            bestFixed = Math.min(bestFixed, timeMillis(() -> fixed.analyze(layout, history, Boards.T0.plusSeconds(DUELS))));
            BoardAnalysis a = learned.analyze(layout, history, Boards.T0.plusSeconds(DUELS));
            SessionContext ctx = new SessionContext(Focus.SMART_MIX, log.subList(0, 20), Set.of(), log, new Random(i));
            bestPair = Math.min(bestPair, timeMillis(() -> learned.next(a, ctx)));
        }
        System.out.printf("333-song board, %d duels: analyse %d ms (learned), %d ms (own ranges), pair %d ms%n",
            DUELS, best, bestFixed, bestPair);
        assertThat(best).isLessThan(500);
        assertThat(bestFixed).isLessThan(500);
        assertThat(bestPair).isLessThan(100);
    }
}
