package fm.tierlist.duel.engine.pairing;

import fm.tierlist.duel.engine.BoardAnalysis;
import fm.tierlist.duel.engine.SongState;

/**
 * The next duel: `a` is the song being settled, `b` its opponent.
 *
 * @param reason why this pairing - BORDER (a sits near the upper/lower border, b anchors it)
 */
public record Matchup(String a, String b, Reason reason) {

    public enum Kind { BORDER }

    public record Reason(Kind kind, String upperTier, String lowerTier) {}

    // The same pair asked again (after an undo), explained from a's current score.
    public static Matchup of(BoardAnalysis analysis, String a, String b) {
        SongState s = analysis.song(a);
        int border = s == null ? -1 : PairScoring.nearestBorder(analysis.cutpoints(), s.rating().mu());
        return new Matchup(a, b, PairScoring.borderReason(analysis, border, Kind.BORDER));
    }
}
