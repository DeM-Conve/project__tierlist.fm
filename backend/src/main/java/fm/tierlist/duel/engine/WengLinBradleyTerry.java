package fm.tierlist.duel.engine;

import java.time.Duration;

/**
 * OpenSkill's Weng-Lin Bayesian rating, Bradley-Terry "full pairing" variant,
 * for one-on-one duels (Weng &amp; Lin, "A Bayesian Approximation Method for
 * Online Ranking", JMLR 2011, Algorithm 1). Implemented here from the paper:
 * <pre>
 *   c   = sqrt(sigmaA^2 + sigmaB^2 + 2 beta^2)
 *   pA  = 1 / (1 + exp((muB - muA) / c))
 *   muA'    = muA + sigmaA^2 / c * (sA - pA)
 *   sigmaA' = sigmaA * sqrt(max(1 - gamma * sigmaA^2 / c^2 * pA (1 - pA), kappa)),  gamma = sigmaA / c
 * </pre>
 * with sA = 1 / 0.5 / 0 for a win / draw / loss (draws handled natively).
 * OpenSkill's mu 25, sigma 25/3 and kappa 1e-4; beta (how random a single
 * verdict is) is ours: 2.0 rather than OpenSkill's 25/6, so two songs whose
 * scores are one tier apart (6) go the expected way ~90% of the time - picks
 * between songs you know are far more consistent than game results.
 */
public final class WengLinBradleyTerry implements RatingModel {

    public static final double MU = 25.0;
    public static final double SIGMA = MU / 3;
    public static final double BETA = 2.0;
    private static final double KAPPA = 1e-4;

    private final double beta;
    private final double driftPerWeek;

    public WengLinBradleyTerry(double driftPerWeek) {
        this(BETA, driftPerWeek);
    }

    public WengLinBradleyTerry(double beta, double driftPerWeek) {
        this.beta = beta;
        this.driftPerWeek = driftPerWeek;
    }

    @Override
    public Rating unknown() {
        return new Rating(MU, SIGMA);
    }

    @Override
    public Rating[] update(Rating a, Rating b, double scoreA) {
        double c = Math.sqrt(a.variance() + b.variance() + 2 * beta * beta);
        double pA = winProbability(a, b);
        return new Rating[] {step(a, c, scoreA, pA), step(b, c, 1 - scoreA, 1 - pA)};
    }

    private static Rating step(Rating r, double c, double score, double p) {
        double mu = r.mu() + r.variance() / c * (score - p);
        double gamma = r.sigma() / c;
        double delta = gamma * r.variance() / (c * c) * p * (1 - p);
        return new Rating(mu, r.sigma() * Math.sqrt(Math.max(1 - delta, KAPPA)));
    }

    @Override
    public double winProbability(Rating a, Rating b) {
        double c = Math.sqrt(a.variance() + b.variance() + 2 * beta * beta);
        return 1 / (1 + Math.exp((b.mu() - a.mu()) / c));
    }

    // Glicko-style: variance grows with idle time, never past "unknown".
    @Override
    public Rating drift(Rating r, Duration idle) {
        double weeks = Math.max(0, idle.toMillis() / (7.0 * 24 * 3600 * 1000));
        double sigma = Math.sqrt(r.variance() + driftPerWeek * driftPerWeek * weeks);
        return new Rating(r.mu(), Math.min(sigma, Math.max(SIGMA, r.sigma())));
    }
}
