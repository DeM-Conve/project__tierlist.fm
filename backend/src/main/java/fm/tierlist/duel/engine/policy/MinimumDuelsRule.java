package fm.tierlist.duel.engine.policy;

// Enough evidence: at least `minimum` duels behind the song (4).
public record MinimumDuelsRule(int minimum) implements SuggestionRule {
    @Override
    public boolean allows(Candidate c) {
        return c.song().duels().size() >= minimum;
    }
}
