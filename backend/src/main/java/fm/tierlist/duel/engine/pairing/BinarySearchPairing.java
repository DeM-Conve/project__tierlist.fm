package fm.tierlist.duel.engine.pairing;

import fm.tierlist.duel.engine.BoardAnalysis;
import fm.tierlist.duel.engine.EngineConfig;
import fm.tierlist.duel.engine.RatingModel;
import fm.tierlist.duel.engine.SongState;

import java.util.Comparator;
import java.util.Optional;

/**
 * Noisy binary search for one song at a time: duel it against a settled anchor
 * from the middle of its plausible range (score +- 2 s.d., within the board),
 * and let the rating update halve the range; repeat until its tier is clear.
 * About log2(tiers) + 2 duels. Which song, and when it's done, is the subclass's.
 */
public abstract class BinarySearchPairing implements PairingStrategy {

    // The song to place now, if any.
    protected abstract Optional<SongState> subject(BoardAnalysis analysis, SessionContext session, EngineConfig config);

    @Override
    public Optional<Matchup> next(BoardAnalysis analysis, SessionContext session, RatingModel model, EngineConfig config) {
        return subject(analysis, session, config).flatMap(s -> anchor(analysis, s, session, config));
    }

    private Optional<Matchup> anchor(BoardAnalysis analysis, SongState s, SessionContext session, EngineConfig config) {
        double lo = analysis.songs().values().stream().filter(x -> x.tier() != null).mapToDouble(x -> x.rating().mu()).min().orElse(s.rating().mu());
        double hi = analysis.songs().values().stream().filter(x -> x.tier() != null).mapToDouble(x -> x.rating().mu()).max().orElse(s.rating().mu());
        double spread = Math.hypot(s.rating().sigma(), 1.0);
        double from = Math.max(lo, s.rating().mu() - 2 * spread);
        double to = Math.min(hi, s.rating().mu() + 2 * spread);
        double target = (from + to) / 2 + 0.25 * spread * session.random().nextGaussian();
        int border = PairScoring.nearestBorder(analysis.cutpoints(), target);
        return PairScoring.opponents(analysis, s, session)
            .min(Comparator.comparingDouble(o -> (Math.abs(o.rating().mu() - target) + 0.5)
                / ((0.3 + 0.7 * (1 - o.entropy())) * PairScoring.repeatFactor(s.id(), o.id(), session, config))))
            .map(o -> new Matchup(s.id(), o.id(), PairScoring.borderReason(analysis, border, Matchup.Kind.PLACE)));
    }

    // Placed once its tier passes the move threshold with enough duels, or after `cap` duels.
    protected static boolean settled(SongState s, int cap, EngineConfig config) {
        return (s.bestProbability() >= config.moveThreshold() && s.duels().size() >= config.minDuels())
            || s.duels().size() >= cap;
    }
}
