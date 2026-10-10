package fm.tierlist.duel.engine.policy;

// The new tier must reach the threshold probability (85%).
public record ConfidenceRule(double threshold) implements SuggestionRule {
    @Override
    public boolean allows(Candidate c) {
        return c.confidence() >= threshold;
    }
}
