package fm.tierlist.duel.engine;

/**
 * The one mapping between the engine's scale (a song's mu, ~25 for an unknown
 * song, one tier ~6 apart) and the score the user sees on every duel page:
 * <pre>
 *   shown score = round(mu x 10)
 * </pre>
 * so a single duel moves it by whole numbers (frontend
 * {@code duel/duelText.js score()} draws it - keep the two in step). The
 * user's own tier ranges (Settings -> Duels) are typed on this shown scale.
 */
public final class ScoreScale {

    public static final double POINTS_PER_MU = 10.0;

    private ScoreScale() {
    }

    public static long shown(double mu) {
        return Math.round(mu * POINTS_PER_MU);
    }

    // The border (mu) under a tier whose lowest shown score is `minimum`: a
    // song is above it exactly when its shown (rounded) score is >= minimum.
    public static double borderBelow(int minimum) {
        return (minimum - 0.5) / POINTS_PER_MU;
    }
}
