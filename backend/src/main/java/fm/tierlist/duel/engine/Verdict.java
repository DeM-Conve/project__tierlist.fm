package fm.tierlist.duel.engine;

// The five-step verdict, from song A's side. "Clearly" counts as two wins in
// one update; a draw is real information (the two belong together).
public enum Verdict {
    A_CLEARLY(1.0, 2),
    A(1.0, 1),
    TOO_CLOSE(0.5, 1),
    B(0.0, 1),
    B_CLEARLY(0.0, 2);

    private final double scoreA;
    private final int weight;

    Verdict(double scoreA, int weight) {
        this.scoreA = scoreA;
        this.weight = weight;
    }

    // A's score in one update: 1 win, 0.5 draw, 0 loss.
    public double scoreA() {
        return scoreA;
    }

    // How many updates the verdict counts as.
    public int weight() {
        return weight;
    }

    // The result seen from one side: +1 win, 0 draw, -1 loss.
    public int signFor(boolean isA) {
        int sign = scoreA == 0.5 ? 0 : scoreA == 1.0 ? 1 : -1;
        return isA ? sign : -sign;
    }
}
