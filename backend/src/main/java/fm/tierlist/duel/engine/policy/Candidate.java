package fm.tierlist.duel.engine.policy;

import fm.tierlist.duel.engine.BoardLayout;
import fm.tierlist.duel.engine.Decision;
import fm.tierlist.duel.engine.SongState;

import java.util.Map;

// A possible move the rules vote on: `song` from its tier (null = to-do) to
// `to`, at `confidence`; `decision` is the user's earlier answer for it, if any.
// For a ranked song `confidence` is the chance it belongs in `to` *or beyond*
// (P(score past the border of `to`)), for a to-do song the chance of `to` itself.
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
    // +1 moving up a tier, -1 down, 0 a to-do song being placed.
    public int direction() {
        if (from == null || !layout.isRanked(from)) return 0;
        return Integer.signum(layout.rankOf(from).orElseThrow() - layout.rankOf(to).orElseThrow());
    }
}
