package fm.tierlist.duel.engine.policy;

import java.util.Optional;

// Enough evidence: at least `minimum` duels behind the song (4).
public record MinimumDuelsRule(int minimum) implements SuggestionRule {
    @Override
    public Optional<Shortfall> shortfall(Candidate c) {
        int n = c.song().duels().size();
        return n >= minimum ? Optional.empty() : Optional.of(new Shortfall(Shortfall.Kind.DUELS, n, minimum));
    }
}
