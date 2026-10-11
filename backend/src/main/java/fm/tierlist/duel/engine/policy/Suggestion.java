package fm.tierlist.duel.engine.policy;

import java.util.List;

// A move the duels make the case for, with its evidence: the record, the
// latest head-to-heads and the score's trend. `unmet` lists what it still
// lacks - empty for a suggested move, not for one the duels only lean towards.
public record Suggestion(
    String song,
    String from,
    String to,
    double confidence,
    int wins,
    int losses,
    int draws,
    List<KeyResult> keyResults,
    List<Double> trend,
    List<Shortfall> unmet
) {
    public Suggestion {
        keyResults = List.copyOf(keyResults);
        trend = List.copyOf(trend);
        unmet = List.copyOf(unmet);
    }

    // One head-to-head: +1 won / 0 draw / -1 lost against `opponent` (then in `opponentTier`).
    public record KeyResult(String opponent, String opponentTier, int result) {}
}
