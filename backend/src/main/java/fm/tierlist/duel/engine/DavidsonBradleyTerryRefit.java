package fm.tierlist.duel.engine;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Batch Bradley-Terry fit with Davidson's tie model, by MM iteration (Hunter,
 * "MM algorithms for generalized Bradley-Terry models", Ann. Stat. 2004):
 * <pre>
 *   P(i beats j) = g_i / (g_i + g_j + nu sqrt(g_i g_j))
 *   P(tie)       = nu sqrt(g_i g_j) / (g_i + g_j + nu sqrt(g_i g_j))
 *   g_i  &lt;- (W_i + T_i / 2) / sum_games w (1 + nu/2 sqrt(g_j / g_i)) / (g_i + g_j + nu sqrt(g_i g_j))
 *   nu   &lt;- T / sum_games w sqrt(g_i g_j) / (g_i + g_j + nu sqrt(g_i g_j))
 * </pre>
 * "Clearly" counts as two wins; each duel is down-weighted by `weeklyDecay` per
 * week of age (tastes change). Each song's prior enters as virtual draws
 * against a fixed opponent at its prior score, weighted by how sure the prior
 * is - that keeps unbeaten songs finite and unduelled songs at their prior.
 * Score = scale * ln(g); its uncertainty is the Laplace approximation, one over
 * the root of the Fisher information: 1/sigma0^2 + sum_games w p(1-p) / scale^2.
 */
public final class DavidsonBradleyTerryRefit implements Refitter {

    private static final int MAX_ITERATIONS = 300;
    private static final double TOLERANCE = 1e-9;

    private final double scale;
    private final double weeklyDecay;

    public DavidsonBradleyTerryRefit(double scale, double weeklyDecay) {
        this.scale = scale;
        this.weeklyDecay = weeklyDecay;
    }

    private record Game(int i, int j, double winsI, double winsJ, double ties) {
        double weight() {
            return winsI + winsJ + ties;
        }
    }

    @Override
    public Map<String, Rating> refit(List<Duel> duels, Map<String, Rating> priors, Instant now) {
        Map<String, Integer> index = new HashMap<>();
        List<String> ids = new ArrayList<>();
        for (Duel d : duels) {
            for (String id : List.of(d.a(), d.b())) {
                if (index.putIfAbsent(id, ids.size()) == null) ids.add(id);
            }
        }
        Map<String, Rating> out = new HashMap<>(priors);
        if (ids.isEmpty()) return out;

        int n = ids.size();
        double[] prior = new double[n];
        double[] priorWeight = new double[n];
        for (int k = 0; k < n; k++) {
            Rating r = priors.getOrDefault(ids.get(k), new Rating(WengLinBradleyTerry.MU, WengLinBradleyTerry.SIGMA));
            prior[k] = Math.exp(r.mu() / scale);
            // Fisher information of a draw at equal strength ~ 1/(4 scale^2): match the prior's variance.
            priorWeight[k] = 4 * scale * scale / r.variance();
        }
        List<Game> games = new ArrayList<>();
        double ties = 0;
        for (Duel d : duels) {
            double w = Math.pow(weeklyDecay, weeksBetween(d.at(), now));
            int i = index.get(d.a());
            int j = index.get(d.b());
            double sa = d.verdict().scoreA();
            double count = d.verdict().weight() * w;
            Game g = sa == 0.5 ? new Game(i, j, 0, 0, count) : sa == 1 ? new Game(i, j, count, 0, 0) : new Game(i, j, 0, count, 0);
            ties += g.ties();
            games.add(g);
        }

        double[] g = prior.clone();
        double nu = ties > 0 ? 0.5 : 1e-3;
        for (int iter = 0; iter < MAX_ITERATIONS; iter++) {
            double[] num = new double[n];
            double[] den = new double[n];
            for (int k = 0; k < n; k++) {
                // Prior: priorWeight virtual draws against a fixed opponent.
                num[k] += priorWeight[k] / 2;
                den[k] += priorWeight[k] * term(g[k], prior[k], nu);
            }
            for (Game game : games) {
                num[game.i()] += game.winsI() + game.ties() / 2;
                num[game.j()] += game.winsJ() + game.ties() / 2;
                den[game.i()] += game.weight() * term(g[game.i()], g[game.j()], nu);
                den[game.j()] += game.weight() * term(g[game.j()], g[game.i()], nu);
            }
            double change = 0;
            for (int k = 0; k < n; k++) {
                double next = num[k] / den[k];
                change = Math.max(change, Math.abs(Math.log(next / g[k])));
                g[k] = next;
            }
            if (ties > 0) {
                double expected = 0;
                for (Game game : games) {
                    double s = Math.sqrt(g[game.i()] * g[game.j()]);
                    expected += game.weight() * s / (g[game.i()] + g[game.j()] + nu * s);
                }
                nu = Math.min(5, Math.max(1e-3, ties / expected));
            }
            if (change < TOLERANCE) break;
        }
        double[] info = new double[n];
        for (int k = 0; k < n; k++) info[k] = priorWeight[k] / (4 * scale * scale);
        for (Game game : games) {
            double p = g[game.i()] / (g[game.i()] + g[game.j()]);
            double fisher = game.weight() * p * (1 - p) / (scale * scale);
            info[game.i()] += fisher;
            info[game.j()] += fisher;
        }
        for (int k = 0; k < n; k++) out.put(ids.get(k), new Rating(scale * Math.log(g[k]), 1 / Math.sqrt(info[k])));
        return out;
    }

    // d/dg_i of ln(g_i + g_j + nu sqrt(g_i g_j)), the MM denominator term.
    private static double term(double gi, double gj, double nu) {
        double s = Math.sqrt(gi * gj);
        return (1 + nu / 2 * Math.sqrt(gj / gi)) / (gi + gj + nu * s);
    }

    private static double weeksBetween(Instant then, Instant now) {
        return Math.max(0, Duration.between(then, now).toMillis() / (7.0 * 24 * 3600 * 1000));
    }
}
