package fm.tierlist.duel.engine;

import java.util.List;

// Strategy: from score to tier. Fitted on the songs the user already placed;
// the fit then gives any rating a probability for each ranked tier.
public interface TierModel {

    // A placed song: its tier's rank (0 = best) and its rating.
    record Placed(int rank, Rating rating) {}

    Fit fit(List<Placed> placed, int tiers, double[] cutpointPriors);

    interface Fit {
        // Probability per ranked tier, best first; sums to 1.
        double[] probabilities(Rating rating);

        // The learned borders' scores, best border first.
        double[] cutpoints();
    }
}
