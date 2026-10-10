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
import java.util.Set;

// Composite of SuggestionRules: a move is suggested only when every rule
// allows it - the confidence gate with hysteresis from the design brief.
public final class SuggestionPolicy {

    private static final int KEY_RESULTS = 4;

    private final List<SuggestionRule> rules;

    public SuggestionPolicy(List<SuggestionRule> rules) {
        this.rules = List.copyOf(rules);
    }

    public static SuggestionPolicy standard(EngineConfig config) {
        return new SuggestionPolicy(List.of(
            new NotLockedRule(),
            new ConfidenceRule(config.moveThreshold()),
            new MinimumDuelsRule(config.minDuels()),
            new BorderOpponentsRule(config.minBorderOpponents()),
            new KeepHysteresisRule(config.keepFreshDuels())
        ));
    }

    public List<Suggestion> suggest(Iterable<SongState> songs, BoardLayout layout, Map<String, String> tierOf,
                                    Map<String, Decision> decisions, Set<String> locks) {
        List<Suggestion> out = new ArrayList<>();
        for (SongState s : songs) {
            if (s.probabilities().length == 0) continue;
            String to = layout.rankedTiers().get(s.bestRank());
            if (to.equals(s.tier())) continue;
            Candidate c = new Candidate(s, s.tier(), to, s.bestProbability(), layout, tierOf, decisions.get(s.id()), locks.contains(s.id()));
            if (rules.stream().allMatch(r -> r.allows(c))) out.add(toSuggestion(c, tierOf));
        }
        out.sort(Comparator.comparingDouble(Suggestion::confidence).reversed());
        return out;
    }

    private static Suggestion toSuggestion(Candidate c, Map<String, String> tierOf) {
        SongState s = c.song();
        List<Duel> duels = s.duels();
        List<Suggestion.KeyResult> key = new ArrayList<>();
        for (int i = duels.size() - 1; i >= 0 && key.size() < KEY_RESULTS; i--) {
            Duel d = duels.get(i);
            String opp = d.opponentOf(s.id());
            key.add(new Suggestion.KeyResult(opp, tierOf.get(opp), d.resultFor(s.id())));
        }
        return new Suggestion(s.id(), c.from(), c.to(), c.confidence(), s.wins(), s.losses(), s.draws(), key, s.trend());
    }
}
