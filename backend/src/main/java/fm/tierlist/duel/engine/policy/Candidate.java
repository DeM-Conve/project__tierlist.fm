package fm.tierlist.duel.engine.policy;

import fm.tierlist.duel.engine.BoardLayout;
import fm.tierlist.duel.engine.Decision;
import fm.tierlist.duel.engine.SongState;

import java.util.Map;

// A possible move the rules vote on: a ranked `song` from its tier to `to`, at
// `confidence` - the chance it belongs in `to` *or beyond* (P(score past the
// border of `to`)); `decision` is the user's earlier answer for it, if any.
// To-do songs never become candidates (SuggestionPolicy.userPlacesIt).
public record Candidate(
    SongState song,
    String from,
    String to,
    double confidence,
    BoardLayout layout,
    Map<String, String> tierOf,
    Decision decision,
    boolean locked
) {
    // +1 moving up a tier, -1 down.
    public int direction() {
        return Integer.signum(layout.rankOf(from).orElseThrow() - layout.rankOf(to).orElseThrow());
    }
}
