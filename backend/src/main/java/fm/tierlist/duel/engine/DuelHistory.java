package fm.tierlist.duel.engine;

import java.util.List;
import java.util.Map;
import java.util.Set;

// Everything stored for one board: starting scores, the duel log (oldest
// first), decisions on suggested moves, and songs locked in their tier.
public record DuelHistory(Map<String, Rating> priors, List<Duel> duels, Map<String, Decision> decisions, Set<String> locks) {
    public DuelHistory {
        priors = Map.copyOf(priors);
        duels = List.copyOf(duels);
        decisions = Map.copyOf(decisions);
        locks = Set.copyOf(locks);
    }

    public static DuelHistory empty() {
        return new DuelHistory(Map.of(), List.of(), Map.of(), Set.of());
    }
}
