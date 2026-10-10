package fm.tierlist.duel.engine;

import java.util.Map;

// Strategy: the score a song starts from (stored the first time it is seen,
// so replays stay deterministic), and where the tier borders sit a priori.
public interface PriorPolicy {

    // Starting ratings for every song on the board not yet in `existing`.
    Map<String, Rating> priorsFor(BoardLayout layout, Map<String, Rating> existing);

    // Prior guess of each border's score, best border first (size = ranked tiers - 1).
    double[] cutpointPriors(int rankedTiers);
}
