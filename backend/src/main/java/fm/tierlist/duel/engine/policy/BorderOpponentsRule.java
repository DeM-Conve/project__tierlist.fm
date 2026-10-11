package fm.tierlist.duel.engine.policy;

import java.util.Objects;
import java.util.Optional;

// Not one lucky matchup: at least `minimum` distinct opponents from near the
// border being crossed - the tiers from `from` to `to`.
public record BorderOpponentsRule(int minimum) implements SuggestionRule {
    @Override
    public Optional<Shortfall> shortfall(Candidate c) {
        int to = c.layout().rankOf(c.to()).orElseThrow();
        int from = c.layout().rankOf(c.from()).orElseThrow();
        int lo = Math.min(from, to);
        int hi = Math.max(from, to);
        long near = c.song().opponents().stream()
            .map(c.tierOf()::get)
            .filter(Objects::nonNull)
            .map(c.layout()::rankOf)
            .filter(r -> r.isPresent() && r.get() >= lo && r.get() <= hi)
            .count();
        return near >= minimum ? Optional.empty() : Optional.of(new Shortfall(Shortfall.Kind.BORDER_OPPONENTS, near, minimum));
    }
}
