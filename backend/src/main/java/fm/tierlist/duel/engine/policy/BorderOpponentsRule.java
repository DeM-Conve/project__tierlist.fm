package fm.tierlist.duel.engine.policy;

import java.util.Objects;

// Not one lucky matchup: at least `minimum` distinct opponents from near the
// border being crossed - the tiers from `from` to `to` (for a to-do song, the
// target tier and its neighbours).
public record BorderOpponentsRule(int minimum) implements SuggestionRule {
    @Override
    public boolean allows(Candidate c) {
        int to = c.layout().rankOf(c.to()).orElseThrow();
        int lo;
        int hi;
        if (c.direction() == 0) {
            lo = to - 1;
            hi = to + 1;
        } else {
            int from = c.layout().rankOf(c.from()).orElseThrow();
            lo = Math.min(from, to);
            hi = Math.max(from, to);
        }
        long near = c.song().opponents().stream()
            .map(c.tierOf()::get)
            .filter(Objects::nonNull)
            .map(c.layout()::rankOf)
            .filter(r -> r.isPresent() && r.get() >= lo && r.get() <= hi)
            .count();
        return near >= minimum;
    }
}
