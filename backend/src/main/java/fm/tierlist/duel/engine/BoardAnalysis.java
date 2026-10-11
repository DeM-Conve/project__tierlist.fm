package fm.tierlist.duel.engine;

import fm.tierlist.duel.engine.policy.Suggestion;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The engine's whole picture of a board: every song's state, the learned
 * borders, how sure it is overall, and what it suggests.
 *
 * @param certainty    mean probability that a ranked song sits in its current tier
 * @param onFence      ranked songs with a real chance of belonging to a neighbouring tier
 * @param equals       pairs marked as equals ("a|b", ids sorted) - never asked again
 * @param leaning      moves the duels point towards that don't meet every rule yet, with what they lack
 * @param tierOrders   per ranked tier, its songs sorted by score, when that differs from the board
 * @param winnerOdds   per duel id, the probability the model gave the eventual winner beforehand (draws absent)
 */
public record BoardAnalysis(
    BoardLayout layout,
    Map<String, SongState> songs,
    double[] cutpoints,
    double certainty,
    List<String> onFence,
    List<Suggestion> suggestions,
    List<Suggestion> leaning,
    Set<String> equals,
    Map<String, List<String>> tierOrders,
    Map<Long, Double> winnerOdds,
    Set<String> locks
) {
    public SongState song(String id) {
        return songs.get(id);
    }

    public boolean areEquals(String a, String b) {
        return equals.contains(pairKey(a, b));
    }

    public static String pairKey(String a, String b) {
        return a.compareTo(b) < 0 ? a + "|" + b : b + "|" + a;
    }

    public double probabilityOfCurrentTier(SongState s) {
        return layout.rankOf(s.tier()).map(k -> s.probabilities()[k]).orElse(0.0);
    }
}
