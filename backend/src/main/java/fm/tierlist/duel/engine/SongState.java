package fm.tierlist.duel.engine;

import java.util.List;

// Everything the engine knows about one song after replaying the log.
// Only ranked songs have one (to-do songs never enter the engine), so `tier`
// is the song's ranked tier; `probabilities` line up with the layout's ranked
// tiers, best first.
public record SongState(
    String id,
    String tier,
    Rating rating,
    double[] probabilities,
    double entropy,
    int bestRank,
    List<Duel> duels,
    List<Double> trend
) {
    public double bestProbability() {
        return probabilities.length == 0 ? 0 : probabilities[bestRank];
    }

    public int wins() {
        return (int) duels.stream().filter(d -> d.resultFor(id) > 0).count();
    }

    public int losses() {
        return (int) duels.stream().filter(d -> d.resultFor(id) < 0).count();
    }

    public int draws() {
        return duels.size() - wins() - losses();
    }

    public List<String> opponents() {
        return duels.stream().map(d -> d.opponentOf(id)).distinct().toList();
    }
}
