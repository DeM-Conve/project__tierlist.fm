package fm.tierlist.duel.engine;

import java.time.Duration;

// Strategy: how one duel moves two songs' ratings. Swap the implementation to
// change the online model without touching pairing, tiers or suggestions.
public interface RatingModel {

    // The rating a song has before any evidence at all.
    Rating unknown();

    // Both ratings after one update; `scoreA` is 1 (A won), 0.5 (draw) or 0.
    Rating[] update(Rating a, Rating b, double scoreA);

    // Probability that A beats B.
    double winProbability(Rating a, Rating b);

    // Taste drift: a song not duelled for `idle` gets less certain.
    Rating drift(Rating r, Duration idle);

    // A verdict's full effect: "clearly" is two wins in one update.
    default Rating[] apply(Rating a, Rating b, Verdict verdict) {
        Rating[] out = {a, b};
        for (int i = 0; i < verdict.weight(); i++) out = update(out[0], out[1], verdict.scoreA());
        return out;
    }
}
