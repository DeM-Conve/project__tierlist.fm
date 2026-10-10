package fm.tierlist.duel.engine.policy;

// A song locked in its tier is never suggested.
public record NotLockedRule() implements SuggestionRule {
    @Override
    public boolean allows(Candidate c) {
        return !c.locked();
    }
}
