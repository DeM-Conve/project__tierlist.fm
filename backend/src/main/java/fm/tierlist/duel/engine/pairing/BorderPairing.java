package fm.tierlist.duel.engine.pairing;

import fm.tierlist.duel.engine.BoardAnalysis;
import fm.tierlist.duel.engine.EngineConfig;
import fm.tierlist.duel.engine.RatingModel;
import fm.tierlist.duel.engine.SongState;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.BiPredicate;

/**
 * Active-learning pairing (the "cheap approximation" from the brief): take the
 * songs whose tier is most uncertain, give each an opponent near the border
 * it's closest to, and pick the pair maximising
 * <pre>  p(1-p)  x  closeness of the song to the border  x  closeness of the opponent to it
 *        x  how settled the opponent is  x  repeat penalties</pre>
 * with p from Thompson samples of both scores, so the same matchups don't
 * keep recurring. Which songs may be settled is the subclass's filter.
 */
public class BorderPairing implements PairingStrategy {

    private final BiPredicate<SongState, BoardAnalysis> subjects;

    public BorderPairing(BiPredicate<SongState, BoardAnalysis> subjects) {
        this.subjects = subjects;
    }

    @Override
    public Optional<Matchup> next(BoardAnalysis analysis, SessionContext session, RatingModel model, EngineConfig config) {
        double[] cuts = analysis.cutpoints();
        if (cuts.length == 0) return Optional.empty();
        String last = session.lastSubject();
        List<SongState> candidates = analysis.songs().values().stream()
            .filter(s -> !analysis.locks().contains(s.id()) && !session.skipped().contains(s.id()))
            .filter(s -> subjects.test(s, analysis))
            .sorted(Comparator.comparingDouble((SongState s) -> -priority(s, last, session, config)))
            .limit(config.smartCandidates())
            .toList();

        Matchup best = null;
        double bestScore = 0;
        for (SongState s : candidates) {
            double sampled = PairScoring.sample(s.rating(), session).mu();
            int border = PairScoring.nearestBorder(cuts, sampled);
            double theta = cuts[border];
            double spread = Math.hypot(s.rating().sigma(), 1.0);
            double nearS = PairScoring.closeness(s.rating().mu(), theta, spread) * (1 + s.entropy());
            for (SongState o : PairScoring.opponents(analysis, s, session).toList()) {
                double p = model.winProbability(PairScoring.sample(s.rating(), session), PairScoring.sample(o.rating(), session));
                double score = p * (1 - p) * 4
                    * nearS
                    * PairScoring.closeness(o.rating().mu(), theta, Math.hypot(o.rating().sigma(), 1.0))
                    * (0.3 + 0.7 * (1 - o.entropy()))
                    * PairScoring.repeatFactor(s.id(), o.id(), session, config);
                if (best == null || score > bestScore) {
                    best = new Matchup(s.id(), o.id(), PairScoring.borderReason(analysis, border, Matchup.Kind.BORDER));
                    bestScore = score;
                }
            }
        }
        return Optional.ofNullable(best);
    }

    // Most uncertain tier first; the song just heard gets a nudge so a few
    // duels in a row keep it (less switching songs while listening).
    private static double priority(SongState s, String last, SessionContext session, EngineConfig config) {
        double p = s.entropy();
        if (s.id().equals(last) && session.run(last) < config.stickyMaxRun()) p += config.stickiness();
        return p;
    }
}
