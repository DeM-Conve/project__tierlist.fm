package fm.tierlist.duel.engine;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class OrdinalProbitTierModelTest {

    private final OrdinalProbitTierModel model = new OrdinalProbitTierModel();
    private final double[] priors = {34, 28, 22, 16};

    private List<TierModel.Placed> placed(int perTier, int... skipTiers) {
        List<TierModel.Placed> out = new ArrayList<>();
        outer:
        for (int k = 0; k < 5; k++) {
            for (int s : skipTiers) if (s == k) continue outer;
            for (int i = 0; i < perTier; i++) out.add(new TierModel.Placed(k, new Rating(37 - 6 * k + (i - perTier / 2.0) * 0.3, 2)));
        }
        return out;
    }

    @Test
    void probabilitiesSumToOneAndPeakAtTheSongsTier() {
        TierModel.Fit fit = model.fit(placed(10), 5, priors);
        double[] p = fit.probabilities(new Rating(31, 1));
        assertThat(java.util.Arrays.stream(p).sum()).isCloseTo(1, within(1e-9));
        assertThat(p[1]).isGreaterThan(0.6);
    }

    @Test
    void cutpointsAreOrderedAndBetweenTiers() {
        double[] c = model.fit(placed(10), 5, priors).cutpoints();
        for (int k = 1; k < c.length; k++) assertThat(c[k]).isLessThan(c[k - 1]);
        assertThat(c[0]).isBetween(31.0, 37.0);
    }

    @Test
    void anEmptyTierKeepsABandNearItsPrior() {
        double[] c = model.fit(placed(10, 0), 5, priors).cutpoints();
        assertThat(c[0]).isCloseTo(34, within(4.0));
        TierModel.Fit fit = model.fit(placed(10, 0), 5, priors);
        assertThat(fit.probabilities(new Rating(45, 1))[0]).isGreaterThan(0.9);
    }

    @Test
    void uncertainSongsAreSpreadOut() {
        TierModel.Fit fit = model.fit(placed(10), 5, priors);
        double sure = fit.probabilities(new Rating(31, 0.5))[1];
        double unsure = fit.probabilities(new Rating(31, 8))[1];
        assertThat(unsure).isLessThan(sure);
    }

    @Test
    void oneTierOrNoSongs() {
        assertThat(model.fit(List.of(), 5, priors).cutpoints()).containsExactly(priors);
        assertThat(model.fit(List.of(new TierModel.Placed(0, new Rating(25, 1))), 1, new double[0]).probabilities(new Rating(25, 1)))
            .containsExactly(1.0);
    }
}
