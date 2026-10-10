package fm.tierlist.duel.engine.pairing;

import fm.tierlist.duel.engine.BoardAnalysis;
import fm.tierlist.duel.engine.Duel;
import fm.tierlist.duel.engine.EngineConfig;
import fm.tierlist.duel.engine.Rating;
import fm.tierlist.duel.engine.SongState;

import java.util.List;
import java.util.stream.Stream;

// Shared maths for the pairing strategies.
final class PairScoring {

    private PairScoring() {
    }

    // Index of the border nearest `mu` (border k sits between tiers k and k+1); -1 if no borders.
    static int nearestBorder(double[] cutpoints, double mu) {
        int best = -1;
        for (int k = 0; k < cutpoints.length; k++) {
            if (best < 0 || Math.abs(cutpoints[k] - mu) < Math.abs(cutpoints[best] - mu)) best = k;
        }
        return best;
    }

    // How close a score is to a border, given how unsure it is: 1 on it, -> 0 far away.
    static double closeness(double mu, double border, double sigma) {
        double z = (mu - border) / Math.max(sigma, 1e-6);
        return Math.exp(-z * z / 2);
    }

    // Thompson sampling: a draw from the song's score distribution.
    static Rating sample(Rating r, SessionContext session) {
        return r.withMu(r.mu() + r.sigma() * session.random().nextGaussian());
    }

    // Songs that may face `subject`: ranked, not skipped, not equals with it, not itself.
    static Stream<SongState> opponents(BoardAnalysis analysis, SongState subject, SessionContext session) {
        return analysis.songs().values().stream()
            .filter(o -> o.tier() != null && !o.id().equals(subject.id()))
            .filter(o -> !session.skipped().contains(o.id()))
            .filter(o -> !analysis.areEquals(subject.id(), o.id()));
    }

    // Penalties: a pair asked recently, an opponent used in the last few duels.
    static double repeatFactor(String a, String b, SessionContext session, EngineConfig config) {
        double f = 1;
        List<Duel> recent = session.recentDuels();
        int from = Math.max(0, recent.size() - config.recentPairWindow());
        if (recent.subList(from, recent.size()).stream().anyMatch(d -> d.samePair(a, b))) f *= config.recentPairPenalty();
        List<Duel> mine = session.sessionDuels();
        if (mine.subList(Math.max(0, mine.size() - 3), mine.size()).stream().anyMatch(d -> d.involves(b))) {
            f *= config.repeatOpponentPenalty();
        }
        return f;
    }

    static Matchup.Reason borderReason(BoardAnalysis analysis, int border, Matchup.Kind kind) {
        List<String> tiers = analysis.layout().rankedTiers();
        if (border < 0) return new Matchup.Reason(kind, null, null);
        return new Matchup.Reason(kind, tiers.get(border), tiers.get(border + 1));
    }
}
