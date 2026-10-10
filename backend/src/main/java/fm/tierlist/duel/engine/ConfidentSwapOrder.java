package fm.tierlist.duel.engine;

import org.apache.commons.math3.distribution.NormalDistribution;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Order within a tier is sorting by score - but only where the evidence is
 * strong: two neighbours swap only when the model is at least `confidence` sure
 * the lower one's true score is higher,
 * <pre>  P(mu_lower &gt; mu_upper) = Phi((mu_lower - mu_upper) / sqrt(sigma_lower^2 + sigma_upper^2))</pre>
 * (repeated, bubble-style, until nothing swaps). Untouched songs keep the
 * board's order; a few "too close" verdicts never reshuffle a tier.
 */
public final class ConfidentSwapOrder implements TierOrderPolicy {

    private static final NormalDistribution PHI = new NormalDistribution(0, 1);

    private final double confidence;

    public ConfidentSwapOrder(double confidence) {
        this.confidence = confidence;
    }

    @Override
    public List<String> order(List<String> boardOrder, Map<String, SongState> songs) {
        List<String> ids = new ArrayList<>(boardOrder);
        boolean swapped = true;
        for (int pass = 0; swapped && pass < ids.size(); pass++) {
            swapped = false;
            for (int i = 0; i + 1 < ids.size(); i++) {
                if (surelyBetter(songs.get(ids.get(i + 1)), songs.get(ids.get(i)))) {
                    String upper = ids.get(i);
                    ids.set(i, ids.get(i + 1));
                    ids.set(i + 1, upper);
                    swapped = true;
                }
            }
        }
        return ids;
    }

    boolean surelyBetter(SongState x, SongState y) {
        if (x == null || y == null) return false;
        double spread = Math.sqrt(x.rating().variance() + y.rating().variance());
        return PHI.cumulativeProbability((x.rating().mu() - y.rating().mu()) / spread) >= confidence;
    }
}
