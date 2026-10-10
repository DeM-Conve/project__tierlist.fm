package fm.tierlist.duel.engine;

import org.apache.commons.math3.analysis.UnivariateFunction;
import org.apache.commons.math3.distribution.NormalDistribution;
import org.apache.commons.math3.optim.MaxEval;
import org.apache.commons.math3.optim.nonlinear.scalar.GoalType;
import org.apache.commons.math3.optim.univariate.BrentOptimizer;
import org.apache.commons.math3.optim.univariate.SearchInterval;
import org.apache.commons.math3.optim.univariate.UnivariateObjectiveFunction;

import java.util.List;

/**
 * Ordinal (probit) regression of the user's current tiers on the songs'
 * scores. Tier k (0 = best) covers scores between cutpoints theta_k (below)
 * and theta_{k-1} (above), and
 * <pre>
 *   P(tier k) = Phi((theta_{k-1} - mu) / s) - Phi((theta_k - mu) / s),   s = sqrt(sigma^2 + noise^2)
 * </pre>
 * where `noise` is how inconsistent the user's own placements are. Cutpoints
 * and noise are fitted by maximum a posteriori (a weak prior keeps a border
 * near its a-priori place when the tiers around it are empty or tiny), by
 * coordinate ascent with Brent's method - the log-likelihood is concave in
 * each cutpoint, and each one is kept between its neighbours.
 */
public final class OrdinalProbitTierModel implements TierModel {

    private static final NormalDistribution PHI = new NormalDistribution(0, 1);
    private static final double CUTPOINT_PRIOR_SD = 3.0;
    private static final double MIN_NOISE = 1.0;
    private static final double MAX_NOISE = 8.0;
    private static final int SWEEPS = 6;

    @Override
    public Fit fit(List<Placed> placed, int tiers, double[] priors) {
        double[] theta = priors.clone();
        double[] noise = {2.0};
        if (tiers > 1 && !placed.isEmpty()) {
            double lo = placed.stream().mapToDouble(p -> p.rating().mu()).min().orElse(0) - 20;
            double hi = placed.stream().mapToDouble(p -> p.rating().mu()).max().orElse(0) + 20;
            lo = Math.min(lo, priors[priors.length - 1] - 20);
            hi = Math.max(hi, priors[0] + 20);
            BrentOptimizer brent = new BrentOptimizer(1e-8, 1e-6);
            for (int sweep = 0; sweep < SWEEPS; sweep++) {
                for (int k = 0; k < theta.length; k++) {
                    final int idx = k;
                    double upper = k == 0 ? hi : theta[k - 1] - 1e-3;
                    double lower = k == theta.length - 1 ? lo : theta[k + 1] + 1e-3;
                    if (upper <= lower) continue;
                    UnivariateFunction f = x -> {
                        double old = theta[idx];
                        theta[idx] = x;
                        double v = logPosterior(placed, theta, noise[0], priors);
                        theta[idx] = old;
                        return v;
                    };
                    double start = Math.min(upper, Math.max(lower, theta[k]));
                    theta[k] = maximize(brent, f, lower, upper, start);
                }
                UnivariateFunction g = s -> logPosterior(placed, theta, s, priors);
                noise[0] = maximize(brent, g, MIN_NOISE, MAX_NOISE, Math.min(MAX_NOISE, Math.max(MIN_NOISE, noise[0])));
            }
        }
        return new ProbitFit(theta, noise[0]);
    }

    private static double maximize(BrentOptimizer brent, UnivariateFunction f, double lo, double hi, double start) {
        return brent.optimize(new MaxEval(200), new UnivariateObjectiveFunction(f), GoalType.MAXIMIZE,
            new SearchInterval(lo, hi, start)).getPoint();
    }

    private static double logPosterior(List<Placed> placed, double[] theta, double noise, double[] priors) {
        double sum = 0;
        for (Placed p : placed) {
            sum += Math.log(Math.max(probability(p.rank(), p.rating(), theta, noise), 1e-12));
        }
        for (int k = 0; k < theta.length; k++) {
            double z = (theta[k] - priors[k]) / CUTPOINT_PRIOR_SD;
            sum -= z * z / 2;
        }
        return sum;
    }

    static double probability(int k, Rating r, double[] theta, double noise) {
        double s = Math.sqrt(r.variance() + noise * noise);
        double above = k == 0 ? 1 : PHI.cumulativeProbability((theta[k - 1] - r.mu()) / s);
        double below = k == theta.length ? 0 : PHI.cumulativeProbability((theta[k] - r.mu()) / s);
        return Math.max(0, above - below);
    }

    private record ProbitFit(double[] theta, double noise) implements Fit {
        @Override
        public double[] probabilities(Rating rating) {
            double[] out = new double[theta.length + 1];
            for (int k = 0; k < out.length; k++) out[k] = probability(k, rating, theta, noise);
            return out;
        }

        @Override
        public double[] cutpoints() {
            return theta.clone();
        }
    }
}
