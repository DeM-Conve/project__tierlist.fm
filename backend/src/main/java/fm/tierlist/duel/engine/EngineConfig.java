package fm.tierlist.duel.engine;

// Every tunable number in one place. Defaults follow the design brief: a move
// is suggested at >= 85% with >= 4 duels against >= 2 opponents near that
// border; Keep needs 5 fresh duels pointing the same way; 3 straight "too
// close" makes a pair equals; old duels lose ~1%/week.
public record EngineConfig(
    double moveThreshold,
    int minDuels,
    int minBorderOpponents,
    int keepFreshDuels,
    int equalsAfterDraws,
    double fenceNeighbourProbability,
    int recentPairWindow,
    double recentPairPenalty,
    double repeatOpponentPenalty,
    double stickiness,
    int stickyMaxRun,
    int smartCandidates,
    double weeklyDecay,
    double driftPerWeek
) {
    public static EngineConfig defaults() {
        return new EngineConfig(0.85, 4, 2, 5, 3, 0.25, 30, 0.25, 0.5, 0.25, 4, 6, 0.99, 0.25);
    }
}
