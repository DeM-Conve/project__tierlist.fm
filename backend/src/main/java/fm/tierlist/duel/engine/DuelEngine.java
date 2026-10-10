package fm.tierlist.duel.engine;

import fm.tierlist.duel.engine.pairing.Matchup;
import fm.tierlist.duel.engine.pairing.PairingStrategies;
import fm.tierlist.duel.engine.pairing.SessionContext;
import fm.tierlist.duel.engine.policy.Suggestion;
import fm.tierlist.duel.engine.policy.SuggestionPolicy;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

/**
 * Facade over the engine's parts. Everything is a pure function of its inputs:
 * {@link #analyze} replays the duel log into a {@link BoardAnalysis};
 * {@link #next} asks the session's pairing strategy for the next duel.
 *
 * <p>Ratings: the batch {@link Refitter} over the whole log, run on demand at
 * every analysis (it's cheap at this scale), gives each song's score and
 * uncertainty, so the order duels happened in never matters; uncertainty then
 * grows with time since the song's last duel (taste drift). The online
 * {@link RatingModel} replays the log alongside, for what it is good at: the
 * odds each duel had beforehand (upsets, pairing) and each song's score trend.
 */
public final class DuelEngine {

    private final EngineConfig config;
    private final RatingModel ratings;
    private final PriorPolicy priors;
    private final Refitter refitter;
    private final TierModel tiers;
    private final SuggestionPolicy suggestions;
    private final PairingStrategies pairing;

    private DuelEngine(Builder b) {
        this.config = b.config;
        this.ratings = b.ratings;
        this.priors = b.priors;
        this.refitter = b.refitter;
        this.tiers = b.tiers;
        this.suggestions = b.suggestions;
        this.pairing = b.pairing;
    }

    public static DuelEngine standard() {
        return builder().build();
    }

    public static Builder builder() {
        return new Builder();
    }

    public EngineConfig config() {
        return config;
    }

    public RatingModel ratingModel() {
        return ratings;
    }

    // Starting scores for songs on the board that don't have one yet - the
    // caller stores them, so later replays start from the same place.
    public Map<String, Rating> newPriors(BoardLayout layout, Map<String, Rating> existing) {
        return priors.priorsFor(layout, existing);
    }

    public Optional<Matchup> next(BoardAnalysis analysis, SessionContext session) {
        return pairing.forFocus(session.focus()).next(analysis, session, ratings, config);
    }

    public BoardAnalysis analyze(BoardLayout layout, DuelHistory history, Instant now) {
        Map<String, String> tierOf = layout.tierOf();
        Map<String, Rating> start = new HashMap<>(history.priors());
        start.putAll(priors.priorsFor(layout, start));

        Replay replay = new Replay(start);
        replay.run(history.duels());
        Map<String, Rating> fitted = new HashMap<>(refitter.refit(history.duels(), start, now));
        fitted.replaceAll((id, r) -> replay.last.containsKey(id) ? ratings.drift(r, Duration.between(replay.last.get(id), now)) : r);
        java.util.function.Function<String, Rating> rating = id -> fitted.getOrDefault(id, ratings.unknown());

        int k = layout.rankedTiers().size();
        List<TierModel.Placed> placed = new ArrayList<>();
        for (String id : layout.ranked()) placed.add(new TierModel.Placed(layout.rankOf(tierOf.get(id)).orElseThrow(), rating.apply(id)));
        TierModel.Fit fit = tiers.fit(placed, k, priors.cutpointPriors(k));

        Map<String, List<Duel>> duelsOf = new HashMap<>();
        for (Duel d : history.duels()) {
            duelsOf.computeIfAbsent(d.a(), x -> new ArrayList<>()).add(d);
            duelsOf.computeIfAbsent(d.b(), x -> new ArrayList<>()).add(d);
        }
        Map<String, SongState> songs = new LinkedHashMap<>();
        List<String> order = new ArrayList<>(layout.ranked());
        order.addAll(layout.unranked());
        for (String id : order) {
            if (songs.containsKey(id)) continue;
            Rating r = rating.apply(id);
            double[] p = k == 0 ? new double[0] : fit.probabilities(r);
            String tier = tierOf.get(id);
            songs.put(id, new SongState(id, layout.isRanked(tier) ? tier : null, r, p, entropy(p), argmax(p),
                List.copyOf(duelsOf.getOrDefault(id, List.of())), replay.trend(id)));
        }

        double certainty = 0;
        int ranked = 0;
        List<String> onFence = new ArrayList<>();
        for (SongState s : songs.values()) {
            if (s.tier() == null) continue;
            int rank = layout.rankOf(s.tier()).orElseThrow();
            certainty += s.probabilities()[rank];
            ranked++;
            double up = rank > 0 ? s.probabilities()[rank - 1] : 0;
            double down = rank < k - 1 ? s.probabilities()[rank + 1] : 0;
            if (Math.max(up, down) >= config.fenceNeighbourProbability()) onFence.add(s.id());
        }

        List<Suggestion> moves = suggestions.suggest(songs.values(), layout, tierOf, history.decisions(), history.locks());
        return new BoardAnalysis(layout, songs, fit.cutpoints(), ranked == 0 ? 0 : certainty / ranked, onFence, moves,
            equalsPairs(history.duels()), tierOrders(layout, songs), replay.winnerOdds, history.locks());
    }

    // Online replay of the log through the rating model (with drift between a
    // song's duels): each song's score trend and each duel's odds beforehand.
    private final class Replay {
        final Map<String, Rating> current;
        final Map<String, Instant> last = new HashMap<>();
        final Map<String, List<Double>> trends = new HashMap<>();
        final Map<Long, Double> winnerOdds = new HashMap<>();

        Replay(Map<String, Rating> start) {
            this.current = new HashMap<>(start);
        }

        private Rating rating(String id) {
            return current.getOrDefault(id, ratings.unknown());
        }

        List<Double> trend(String id) {
            List<Double> t = new ArrayList<>();
            t.add(rating(id).mu());
            if (trends.containsKey(id)) {
                t.clear();
                t.addAll(trends.get(id));
            }
            return List.copyOf(t);
        }

        void run(List<Duel> duels) {
            for (Duel d : duels) {
                Rating a = aged(d.a(), d.at());
                Rating b = aged(d.b(), d.at());
                double pA = ratings.winProbability(a, b);
                if (d.verdict().scoreA() != 0.5) winnerOdds.put(d.id(), d.verdict().scoreA() == 1 ? pA : 1 - pA);
                trends.computeIfAbsent(d.a(), x -> new ArrayList<>(List.of(a.mu())));
                trends.computeIfAbsent(d.b(), x -> new ArrayList<>(List.of(b.mu())));
                Rating[] out = ratings.apply(a, b, d.verdict());
                current.put(d.a(), out[0]);
                current.put(d.b(), out[1]);
                trends.get(d.a()).add(out[0].mu());
                trends.get(d.b()).add(out[1].mu());
                last.put(d.a(), d.at());
                last.put(d.b(), d.at());
            }
        }

        private Rating aged(String id, Instant at) {
            Rating r = rating(id);
            return last.containsKey(id) ? ratings.drift(r, Duration.between(last.get(id), at)) : r;
        }
    }

    // Pairs whose last N duels were all "too close".
    private Set<String> equalsPairs(List<Duel> duels) {
        Map<String, List<Duel>> byPair = new HashMap<>();
        for (Duel d : duels) byPair.computeIfAbsent(BoardAnalysis.pairKey(d.a(), d.b()), x -> new ArrayList<>()).add(d);
        Set<String> out = new HashSet<>();
        int n = config.equalsAfterDraws();
        byPair.forEach((key, list) -> {
            if (list.size() >= n && list.subList(list.size() - n, list.size()).stream().allMatch(d -> d.verdict() == Verdict.TOO_CLOSE)) {
                out.add(key);
            }
        });
        return out;
    }

    // Order within a tier is just sorting by score - offered where it differs
    // from the board and the tier has seen at least one duel.
    private static Map<String, List<String>> tierOrders(BoardLayout layout, Map<String, SongState> songs) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        for (String tier : layout.rankedTiers()) {
            List<String> ids = layout.songsIn(tier).stream().distinct().toList();
            if (ids.size() < 2 || ids.stream().allMatch(id -> songs.get(id).duels().isEmpty())) continue;
            List<String> sorted = ids.stream()
                .sorted(Comparator.comparingDouble((String id) -> songs.get(id).rating().mu()).reversed())
                .toList();
            if (!sorted.equals(ids)) out.put(tier, sorted);
        }
        return out;
    }

    private static double entropy(double[] p) {
        if (p.length < 2) return 0;
        double h = 0;
        for (double x : p) if (x > 0) h -= x * Math.log(x);
        return h / Math.log(p.length);
    }

    private static int argmax(double[] p) {
        int best = 0;
        for (int i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
        return best;
    }

    // Builder: every part defaults to the standard choice; replace any one.
    public static final class Builder {
        private EngineConfig config = EngineConfig.defaults();
        private RatingModel ratings;
        private PriorPolicy priors;
        private Refitter refitter;
        private TierModel tiers;
        private SuggestionPolicy suggestions;
        private PairingStrategies pairing;

        public Builder config(EngineConfig v) { this.config = Objects.requireNonNull(v); return this; }
        public Builder ratingModel(RatingModel v) { this.ratings = v; return this; }
        public Builder priorPolicy(PriorPolicy v) { this.priors = v; return this; }
        public Builder refitter(Refitter v) { this.refitter = v; return this; }
        public Builder tierModel(TierModel v) { this.tiers = v; return this; }
        public Builder suggestionPolicy(SuggestionPolicy v) { this.suggestions = v; return this; }
        public Builder pairing(PairingStrategies v) { this.pairing = v; return this; }

        public DuelEngine build() {
            if (ratings == null) ratings = new WengLinBradleyTerry(config.driftPerWeek());
            if (priors == null) priors = new TierPriorPolicy(6.0, 3.0, ratings);
            if (refitter == null) refitter = new DavidsonBradleyTerryRefit(REFIT_SCALE, config.weeklyDecay());
            if (tiers == null) tiers = new OrdinalProbitTierModel();
            if (suggestions == null) suggestions = SuggestionPolicy.standard(config);
            if (pairing == null) pairing = PairingStrategies.standard();
            return new DuelEngine(this);
        }
    }

    // The batch fit's logistic scale = the online model's for two settled songs: sqrt(2) beta.
    static final double REFIT_SCALE = Math.sqrt(2) * WengLinBradleyTerry.BETA;
}
