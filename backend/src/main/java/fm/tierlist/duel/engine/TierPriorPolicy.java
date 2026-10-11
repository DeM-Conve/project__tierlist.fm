package fm.tierlist.duel.engine;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

// A song starts from the tier the user gave it: tiers are evenly spaced bands
// around the model's mean, a song sits at its tier's centre nudged by its place
// in the tier (so an untouched tier keeps its order), fairly sure of it. A to-do
// song gets none: to-do songs are never part of duels (BoardLayout.toDo()).
public final class TierPriorPolicy implements PriorPolicy {

    private final double spacing;
    private final double rankedSigma;
    private final RatingModel model;

    public TierPriorPolicy(double spacing, double rankedSigma, RatingModel model) {
        this.spacing = spacing;
        this.rankedSigma = rankedSigma;
        this.model = model;
    }

    private double centre(int rank, int tiers) {
        return model.unknown().mu() + spacing * ((tiers - 1) / 2.0 - rank);
    }

    @Override
    public Map<String, Rating> priorsFor(BoardLayout layout, Map<String, Rating> existing) {
        Map<String, Rating> out = new HashMap<>();
        int tiers = layout.rankedTiers().size();
        for (int k = 0; k < tiers; k++) {
            List<String> ids = layout.songsIn(layout.rankedTiers().get(k));
            for (int i = 0; i < ids.size(); i++) {
                double mu = centre(k, tiers) + 0.3 * spacing * (0.5 - (i + 0.5) / ids.size());
                if (!existing.containsKey(ids.get(i)) && !out.containsKey(ids.get(i))) {
                    out.put(ids.get(i), new Rating(mu, rankedSigma));
                }
            }
        }
        return out;
    }

    @Override
    public double[] cutpointPriors(int tiers) {
        double[] out = new double[Math.max(0, tiers - 1)];
        for (int k = 0; k < out.length; k++) out[k] = (centre(k, tiers) + centre(k + 1, tiers)) / 2;
        return out;
    }
}
