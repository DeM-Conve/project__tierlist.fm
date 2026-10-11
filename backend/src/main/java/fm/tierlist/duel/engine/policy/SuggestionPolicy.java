package fm.tierlist.duel.engine.policy;

import fm.tierlist.duel.engine.BoardLayout;
import fm.tierlist.duel.engine.Decision;
import fm.tierlist.duel.engine.Duel;
import fm.tierlist.duel.engine.EngineConfig;
import fm.tierlist.duel.engine.SongState;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Composite of SuggestionRules: a move is suggested only when every rule
 * allows it - the confidence gate with hysteresis from the design brief.
 *
 * <p>Which move, and how sure: a ranked song whose most likely tier isn't its
 * own moves towards it, to the farthest tier `t` on that side it belongs in
 * "`t` or beyond" with at least `targetConfidence` - P(score past the border
 * of `t`), summed over the ordinal model's tiers - else just one tier, at
 * whatever that chance is. Asking "the exact tier" instead capped every move
 * into a middle tier below the gate: a tier is only ~6 points wide, so even a
 * song settled dead in its centre (sigma ~1.8 after 8 duels, plus the user's
 * own placement noise) tops out near 80%, while moves into the top or bottom
 * tier (no far border) were unbounded.
 *
 * <p>To-do songs never get a suggestion of any kind - no move, no leaning
 * (the user's call: "for to-do songs, the person will decide the tier"). The
 * engine already leaves them out of the analysis; {@link #userPlacesIt} is the
 * same rule stated here, so no caller can feed one through.
 *
 * <p>Moves that fail a rule the user hasn't answered (not a lock, not a Keep)
 * and that have at least one duel behind them come back as "leaning", with
 * what they lack, so the page can say why nothing is suggested yet.
 */
public final class SuggestionPolicy {

    private static final int KEY_RESULTS = 4;

    private final List<SuggestionRule> rules;
    private final double targetConfidence;

    public SuggestionPolicy(List<SuggestionRule> rules, double targetConfidence) {
        this.rules = List.copyOf(rules);
        this.targetConfidence = targetConfidence;
    }

    public static SuggestionPolicy standard(EngineConfig config) {
        return new SuggestionPolicy(List.of(
            new NotLockedRule(),
            new ConfidenceRule(config.moveThreshold()),
            new MinimumDuelsRule(config.minDuels()),
            new BorderOpponentsRule(config.minBorderOpponents()),
            new KeepHysteresisRule(config.keepFreshDuels())
        ), config.moveThreshold());
    }

    // `ready`: every rule met, the suggested moves. `leaning`: where the duels
    // point but the evidence isn't there yet. Both most confident first.
    public record Result(List<Suggestion> ready, List<Suggestion> leaning) {
        public Result {
            ready = List.copyOf(ready);
            leaning = List.copyOf(leaning);
        }
    }

    public Result suggest(Iterable<SongState> songs, BoardLayout layout, Map<String, String> tierOf,
                          Map<String, Decision> decisions, Set<String> locks) {
        List<Suggestion> ready = new ArrayList<>();
        List<Suggestion> leaning = new ArrayList<>();
        for (SongState s : songs) {
            if (userPlacesIt(s, layout) || s.probabilities().length == 0) continue;
            int from = layout.rankOf(s.tier()).orElseThrow();
            if (from == s.bestRank()) continue;
            int[] to = new int[1];
            double confidence = target(s.probabilities(), from, s.bestRank(), to);
            Candidate c = new Candidate(s, s.tier(), layout.rankedTiers().get(to[0]), confidence, layout, tierOf,
                decisions.get(s.id()), locks.contains(s.id()));
            List<Shortfall> unmet = rules.stream().map(r -> r.shortfall(c)).flatMap(Optional::stream).toList();
            if (unmet.isEmpty()) ready.add(toSuggestion(c, tierOf, unmet));
            else if (!s.duels().isEmpty() && unmet.stream().noneMatch(Shortfall::userDecided)) leaning.add(toSuggestion(c, tierOf, unmet));
        }
        Comparator<Suggestion> surest = Comparator.comparingDouble(Suggestion::confidence).reversed();
        ready.sort(surest);
        leaning.sort(surest);
        return new Result(ready, leaning);
    }

    // Rule "the user places to-do songs": a song outside the ranked tiers (on
    // the to-do list) is never suggested anywhere, not even as leaning - the
    // user decides its tier (the user's call).
    static boolean userPlacesIt(SongState s, BoardLayout layout) {
        return !layout.isRanked(s.tier());
    }

    // The farthest tier towards `best` the song belongs in "or beyond" with at
    // least targetConfidence (else the next tier over); returns that chance.
    private double target(double[] p, int from, int best, int[] to) {
        int step = best < from ? -1 : 1;
        double beyond = 0;
        // Walk from the far end towards `from`: P(t or beyond) grows as t nears it.
        int far = step < 0 ? 0 : p.length - 1;
        for (int t = far; t != from; t -= step) {
            beyond += p[t];
            to[0] = t;
            if (beyond >= targetConfidence) return beyond;
        }
        return beyond;
    }

    private static Suggestion toSuggestion(Candidate c, Map<String, String> tierOf, List<Shortfall> unmet) {
        SongState s = c.song();
        List<Duel> duels = s.duels();
        List<Suggestion.KeyResult> key = new ArrayList<>();
        for (int i = duels.size() - 1; i >= 0 && key.size() < KEY_RESULTS; i--) {
            Duel d = duels.get(i);
            String opp = d.opponentOf(s.id());
            key.add(new Suggestion.KeyResult(opp, tierOf.get(opp), d.resultFor(s.id())));
        }
        return new Suggestion(s.id(), c.from(), c.to(), c.confidence(), s.wins(), s.losses(), s.draws(), key, s.trend(), unmet);
    }
}
