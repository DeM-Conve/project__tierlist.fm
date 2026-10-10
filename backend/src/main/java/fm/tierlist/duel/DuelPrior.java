package fm.tierlist.duel;

import fm.tierlist.duel.engine.Rating;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

// The score a song started from (`duel_prior`).
@Entity
@Table(name = "duel_prior")
public class DuelPrior {

    @EmbeddedId
    private BoardSongId id;

    // The tier the score was made from.
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(nullable = false, columnDefinition = "tier_slot")
    private TierSlot tier;

    @Column(nullable = false)
    private double mu;

    @Column(nullable = false)
    private double sigma;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected DuelPrior() {
    }

    DuelPrior(BoardSongId id, TierSlot tier, Rating rating, Instant createdAt) {
        this.id = id;
        this.createdAt = createdAt;
        remake(tier, rating);
    }

    // The song's tier changed: start it from the new one.
    void remake(TierSlot newTier, Rating rating) {
        this.tier = newTier;
        this.mu = rating.mu();
        this.sigma = rating.sigma();
    }

    public TierSlot getTier() {
        return tier;
    }

    public String getVideoId() {
        return id.videoId();
    }

    public Rating toRating() {
        return new Rating(mu, sigma);
    }
}
