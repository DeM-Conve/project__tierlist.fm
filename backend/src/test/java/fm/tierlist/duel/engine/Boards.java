package fm.tierlist.duel.engine;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

// Test fixtures: boards of fake 11-character video ids and duel logs.
public final class Boards {

    public static final List<String> TIERS = List.of("S", "A", "B", "C", "D");
    public static final Instant T0 = Instant.parse("2026-10-01T12:00:00Z");
    public static final UUID SESSION = UUID.fromString("00000000-0000-0000-0000-000000000001");

    private Boards() {
    }

    public static String id(String tier, int i) {
        return String.format("%-3s%08d", tier, i).replace(' ', '_');
    }

    // `perTier` songs in each ranked tier, `todo` to-do songs.
    public static BoardLayout board(int perTier, int todo) {
        Map<String, List<String>> songs = new LinkedHashMap<>();
        for (String t : TIERS) {
            List<String> ids = new ArrayList<>();
            for (int i = 0; i < perTier; i++) ids.add(id(t, i));
            songs.put(t, ids);
        }
        List<String> td = new ArrayList<>();
        for (int i = 0; i < todo; i++) td.add(id("TD", i));
        songs.put("TODO", td);
        return new BoardLayout(TIERS, "TODO", songs);
    }

    public static Duel duel(long n, String a, String b, Verdict v) {
        return new Duel(n, SESSION, a, b, v, T0.plusSeconds(n));
    }

    public static DuelHistory history(DuelEngine engine, BoardLayout layout, List<Duel> duels) {
        return new DuelHistory(engine.newPriors(layout, Map.of()), duels, Map.of(), java.util.Set.of());
    }
}
