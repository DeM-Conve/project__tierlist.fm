package fm.tierlist.duel.engine.policy;

// Specification: one condition a move must meet before it is suggested. Add a
// rule by implementing this and listing it in SuggestionPolicy.
public interface SuggestionRule {
    boolean allows(Candidate candidate);
}
