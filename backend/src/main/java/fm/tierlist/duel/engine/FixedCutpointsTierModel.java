package fm.tierlist.duel.engine;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * The user's own tier borders (Settings -> Duels -> Tier borders: My own
 * ranges) as fixed cutpoints: tier k covers the scores from its own lower
 * border up to the next tier's. Only the noise term - how consistent the
 * user's placements are - is still learned, by the {@code noiseFrom} model
 * (normally {@link OrdinalProbitTierModel}); probabilities are then the same
 * probit as the learned model's, around these borders.
 *
 * <p>{@code lowerBorder} maps a ranked tier id to the score (engine scale,
 * mu - see {@link ScoreScale#borderBelow}) at its bottom; the worst tier
 * needs none. A board without some tier uses the borders of the tiers it has:
 * between two neighbouring tiers on the board lies the upper one's own border.
 */
public final class FixedCutpointsTierModel implements TierModel {

    private final Map<String, Double> lowerBorder;
    private final TierModel noiseFrom;

    public FixedCutpointsTierModel(Map<String, Double> lowerBorder, TierModel noiseFrom) {
        this.lowerBorder = Map.copyOf(lowerBorder);
        this.noiseFrom = Objects.requireNonNull(noiseFrom);
    }

    @Override
    public Fit fit(List<Placed> placed, List<String> tiers, double[] cutpointPriors) {
        double[] theta = new double[Math.max(0, tiers.size() - 1)];
        for (int k = 0; k < theta.length; k++) {
            Double b = lowerBorder.get(tiers.get(k));
            if (b == null) throw new IllegalArgumentException("No border set under tier " + tiers.get(k));
            if (k > 0 && !(b < theta[k - 1])) throw new IllegalArgumentException("Tier borders must go down tier by tier");
            theta[k] = b;
        }
        double noise = theta.length == 0 || placed.isEmpty()
            ? OrdinalProbitTierModel.DEFAULT_NOISE
            : noiseFrom.fit(placed, tiers, cutpointPriors).noise();
        return OrdinalProbitTierModel.withBorders(theta, noise);
    }
}
