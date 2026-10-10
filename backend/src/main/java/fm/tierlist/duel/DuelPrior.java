package fm.tierlist.duel;

import fm.tierlist.duel.engine.Rating;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;

// The score a song started from (`duel_prior`).
@Entity
@Table(name = "duel_prior")
public class DuelPrior {

    @EmbeddedId
    private BoardSongId id;

    @Column(nullable = false)
    private double mu;

    @Column(nullable = false)
    private double sigma;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected DuelPrior() {
    }

    DuelPrior(BoardSongId id, Rating rating, Instant createdAt) {
        this.id = id;
        this.mu = rating.mu();
        this.sigma = rating.sigma();
        this.createdAt = createdAt;
    }

    public String getVideoId() {
        return id.videoId();
    }

    public Rating toRating() {
        return new Rating(mu, sigma);
    }
}
