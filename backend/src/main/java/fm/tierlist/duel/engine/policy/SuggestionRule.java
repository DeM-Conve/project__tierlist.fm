package fm.tierlist.duel.engine.policy;

import java.util.Optional;

// Specification: one condition a move must meet before it is suggested. Add a
// rule by implementing this and listing it in SuggestionPolicy. A rule says
// what is missing (empty = met), so the page can tell the user why not yet.
public interface SuggestionRule {
    Optional<Shortfall> shortfall(Candidate candidate);

    default boolean allows(Candidate candidate) {
        return shortfall(candidate).isEmpty();
    }
}
