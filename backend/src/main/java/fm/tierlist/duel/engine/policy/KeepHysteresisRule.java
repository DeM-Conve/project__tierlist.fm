package fm.tierlist.duel.engine.policy;

import fm.tierlist.duel.engine.Decision;
import fm.tierlist.duel.engine.Duel;

import java.util.List;
import java.util.Optional;

// No flip-flopping: after "Keep", the song is only suggested again once
// `freshDuels` (5) duels since then point the same way - wins for a move up,
// losses for a move down. A Keep answers the song *in the tier it was kept
// in*: once the song is in another tier (moved by hand, or a Move), a move
// out of that tier is a new question and the old Keep no longer holds it back.
public record KeepHysteresisRule(int freshDuels) implements SuggestionRule {
    @Override
    public Optional<Shortfall> shortfall(Candidate c) {
        Decision d = c.decision();
        if (d == null || d.kind() != Decision.Kind.KEPT || !d.from().equals(c.from())) return Optional.empty();
        List<Duel> duels = c.song().duels();
        List<Duel> since = duels.subList(Math.min(d.duelsAtDecision(), duels.size()), duels.size());
        String id = c.song().id();
        long agreeing = since.stream()
            .filter(x -> Integer.signum(x.resultFor(id)) == c.direction())
            .count();
        return agreeing >= freshDuels ? Optional.empty() : Optional.of(new Shortfall(Shortfall.Kind.FRESH_DUELS, agreeing, freshDuels));
    }
}
