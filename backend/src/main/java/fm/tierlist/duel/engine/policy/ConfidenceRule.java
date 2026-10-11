package fm.tierlist.duel.engine.policy;

import java.util.Optional;

// The move must reach the threshold probability (85%) - see Candidate#confidence.
public record ConfidenceRule(double threshold) implements SuggestionRule {
    @Override
    public Optional<Shortfall> shortfall(Candidate c) {
        return c.confidence() >= threshold ? Optional.empty()
            : Optional.of(new Shortfall(Shortfall.Kind.CONFIDENCE, c.confidence(), threshold));
    }
}
