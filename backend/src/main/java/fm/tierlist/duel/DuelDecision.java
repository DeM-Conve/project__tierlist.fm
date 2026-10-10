package fm.tierlist.duel;

import fm.tierlist.duel.engine.Decision;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

// The user's answer to a suggested move (`duel_decision`).
@Entity
@Table(name = "duel_decision")
public class DuelDecision {

    @EmbeddedId
    private BoardSongId id;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "from_tier", nullable = false, columnDefinition = "tier_slot")
    private TierSlot fromTier;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "to_tier", nullable = false, columnDefinition = "tier_slot")
    private TierSlot toTier;

    @Column(nullable = false)
    private float confidence;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(nullable = false, columnDefinition = "move_decision")
    private Decision.Kind decision;

    @Column(name = "duels_at_decision", nullable = false)
    private int duelsAtDecision;

    @Column(name = "decided_at", nullable = false)
    private Instant decidedAt;

    protected DuelDecision() {
    }

    DuelDecision(BoardSongId id, TierSlot from, TierSlot to, double confidence, Decision.Kind decision, int duelsAtDecision, Instant at) {
        this.id = id;
        this.fromTier = from;
        this.toTier = to;
        this.confidence = (float) confidence;
        this.decision = decision;
        this.duelsAtDecision = duelsAtDecision;
        this.decidedAt = at;
    }

    // The same decision on a renamed board.
    DuelDecision movedTo(String board) {
        return new DuelDecision(new BoardSongId(id.userId(), board, id.videoId()), fromTier, toTier, confidence, decision, duelsAtDecision, decidedAt);
    }

    public String getVideoId() {
        return id.videoId();
    }

    public Decision toDecision() {
        return new Decision(decision, fromTier.name(), toTier.name(), duelsAtDecision);
    }
}
