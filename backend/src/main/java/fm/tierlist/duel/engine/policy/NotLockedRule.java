package fm.tierlist.duel.engine.policy;

import java.util.Optional;

// A song locked in its tier is never suggested.
public record NotLockedRule() implements SuggestionRule {
    @Override
    public Optional<Shortfall> shortfall(Candidate c) {
        return c.locked() ? Optional.of(new Shortfall(Shortfall.Kind.LOCKED, 1, 0)) : Optional.empty();
    }
}
