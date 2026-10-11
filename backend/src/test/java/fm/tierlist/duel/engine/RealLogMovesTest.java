package fm.tierlist.duel.engine;

import fm.tierlist.duel.engine.policy.Shortfall;
import fm.tierlist.duel.engine.policy.Suggestion;
import org.assertj.core.data.Offset;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

// A real 30-duel Smart mix log on a 22-song board (ids anonymised: tier +
// board position). Board certainty ~65%, 10 songs on the fence - and the
// moves page was empty with nothing to say why. Now the songs the duels point
// away from their tier show up as "leaning", with what they still lack.
class RealLogMovesTest {

    private static final String[][] LOG = {
        {"b5", "c2", "A", "2026-10-10T14:43:51Z"}, {"b1", "a5", "B", "2026-10-10T14:44:05Z"},
        {"b4", "c1", "B", "2026-10-10T14:45:06Z"}, {"b4", "b3", "TOO_CLOSE", "2026-10-10T14:45:30Z"},
        {"c1", "b3", "A", "2026-10-10T14:47:34Z"}, {"b5", "b4", "A", "2026-10-10T14:48:26Z"},
        {"b4", "b1", "TOO_CLOSE", "2026-10-10T14:48:48Z"}, {"b4", "c3", "B_CLEARLY", "2026-10-10T14:49:25Z"},
        {"c1", "c3", "B", "2026-10-10T15:01:20Z"}, {"c3", "b3", "A", "2026-10-10T15:01:32Z"},
        {"c3", "b2", "B_CLEARLY", "2026-10-10T15:01:44Z"}, {"c3", "b1", "TOO_CLOSE", "2026-10-10T15:02:08Z"},
        {"b4", "c4", "A", "2026-10-10T15:02:40Z"}, {"b1", "c1", "TOO_CLOSE", "2026-10-10T15:02:55Z"},
        {"b1", "b3", "A", "2026-10-10T15:03:06Z"}, {"b5", "b2", "TOO_CLOSE", "2026-10-10T15:03:25Z"},
        {"b5", "a3", "TOO_CLOSE", "2026-10-10T15:03:49Z"}, {"b2", "a3", "TOO_CLOSE", "2026-10-10T15:05:36Z"},
        {"b3", "c5", "TOO_CLOSE", "2026-10-10T15:06:17Z"}, {"b3", "c6", "A", "2026-10-10T15:06:36Z"},
        {"b3", "c2", "A", "2026-10-10T15:07:04Z"}, {"b2", "a4", "B", "2026-10-10T15:07:33Z"},
        {"b2", "a5", "B_CLEARLY", "2026-10-10T15:07:41Z"}, {"c3", "c5", "A", "2026-10-10T15:07:55Z"},
        {"c3", "c7", "A", "2026-10-10T15:09:08Z"}, {"c3", "c8", "TOO_CLOSE", "2026-10-10T15:09:32Z"},
        {"b4", "c8", "TOO_CLOSE", "2026-10-11T10:41:49Z"}, {"b4", "c5", "A", "2026-10-11T10:43:58Z"},
        {"b5", "a2", "TOO_CLOSE", "2026-10-11T10:44:45Z"}, {"b5", "b1", "TOO_CLOSE", "2026-10-11T10:44:54Z"},
    };

    private final DuelEngine engine = DuelEngine.standard();

    private BoardAnalysis analyze() {
        Map<String, List<String>> songs = new LinkedHashMap<>();
        songs.put("S", List.of("s1"));
        songs.put("A", List.of("a1", "a2", "a3", "a4", "a5"));
        songs.put("B", List.of("b1", "b2", "b3", "b4", "b5"));
        songs.put("C", List.of("c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"));
        songs.put("D", List.of("d1", "d2", "d3"));
        BoardLayout layout = new BoardLayout(Boards.TIERS, null, songs);
        List<Duel> log = new ArrayList<>();
        for (int i = 0; i < LOG.length; i++) {
            log.add(new Duel(i + 1, Boards.SESSION, LOG[i][0], LOG[i][1], Verdict.valueOf(LOG[i][2]), Instant.parse(LOG[i][3])));
        }
        return engine.analyze(layout, new DuelHistory(engine.newPriors(layout, Map.of()), log, Map.of(), Set.of()),
            Instant.parse("2026-10-11T12:00:00Z"));
    }

    @Test
    void nothingIsSureYetButThePageSaysWhereTheDuelsLean() {
        BoardAnalysis a = analyze();
        assertThat(a.certainty()).isCloseTo(0.66, Offset.offset(0.02));
        assertThat(a.onFence()).hasSize(10);
        assertThat(a.suggestions()).isEmpty();

        // c3 beat b3, b4 (clearly), c1, c5, c7: surely not a C, ~83% "B or better".
        Suggestion c3 = a.leaning().get(0);
        assertThat(c3.song()).isEqualTo("c3");
        assertThat(c3.to()).isEqualTo("B");
        assertThat(c3.confidence()).isBetween(0.8, 0.85);
        assertThat(c3.unmet()).extracting(Shortfall::kind).containsExactly(Shortfall.Kind.CONFIDENCE);
        assertThat(c3.unmet().get(0).need()).isEqualTo(0.85);
        // b3 and b4 lost to C songs: leaning down a tier; c1 (beat b3 and b4) a coin flip up.
        assertThat(a.leaning()).filteredOn(s -> !s.song().equals("c3"))
            .extracting(Suggestion::song, Suggestion::to).containsExactlyInAnyOrder(
                org.assertj.core.groups.Tuple.tuple("b3", "C"), org.assertj.core.groups.Tuple.tuple("b4", "C"),
                org.assertj.core.groups.Tuple.tuple("c1", "B"));
    }
}
