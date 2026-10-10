package fm.tierlist.duel.engine;

// A song's hidden score (mu) and how unsure we are about it (sigma).
public record Rating(double mu, double sigma) {
    public Rating {
        if (!(sigma > 0)) throw new IllegalArgumentException("sigma must be > 0");
    }

    public double variance() {
        return sigma * sigma;
    }

    public Rating withMu(double newMu) {
        return new Rating(newMu, sigma);
    }
}
