package fm.tierlist.duel.engine.policy;

import fm.tierlist.duel.engine.Decision;
import fm.tierlist.duel.engine.Duel;

import java.util.List;

// No flip-flopping: after "Keep", the song is only suggested again once
// `freshDuels` (5) duels since then point the same way - wins for a move up,
// losses for a move down (any result for a to-do song).
public record KeepHysteresisRule(int freshDuels) implements SuggestionRule {
    @Override
    public boolean allows(Candidate c) {
        Decision d = c.decision();
        if (d == null || d.kind() != Decision.Kind.KEPT) return true;
        List<Duel> duels = c.song().duels();
        List<Duel> since = duels.subList(Math.min(d.duelsAtDecision(), duels.size()), duels.size());
        String id = c.song().id();
        long agreeing = since.stream()
            .filter(x -> c.direction() == 0 || Integer.signum(x.resultFor(id)) == c.direction())
            .count();
        return agreeing >= freshDuels;
    }
}
