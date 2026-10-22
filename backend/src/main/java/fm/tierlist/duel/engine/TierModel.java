package fm.tierlist.duel.engine;

import java.util.List;

// Strategy: from score to tier. Fitted on the songs the user already placed;
// the fit then gives any rating a probability for each ranked tier.
// Two implementations: OrdinalProbitTierModel learns the borders from the
// placements (the default), FixedCutpointsTierModel takes the user's own
// borders (Settings -> Duels -> Tier borders: My own ranges).
public interface TierModel {

    // A placed song: its tier's rank (0 = best) and its rating.
    record Placed(int rank, Rating rating) {}

    // `tiers`: the layout's ranked tier ids, best first (a board may lack some).
    Fit fit(List<Placed> placed, List<String> tiers, double[] cutpointPriors);

    interface Fit {
        // Probability per ranked tier, best first; sums to 1.
        double[] probabilities(Rating rating);

        // The borders' scores (engine scale, mu), best border first.
        double[] cutpoints();

        // How inconsistent the user's own placements are (engine scale).
        double noise();
    }
}
