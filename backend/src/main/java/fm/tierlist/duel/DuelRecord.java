package fm.tierlist.duel;

import fm.tierlist.duel.engine.Duel;
import fm.tierlist.duel.engine.Verdict;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

// A row of the duel log (`duel`).
@Entity
@Table(name = "duel")
public class DuelRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(name = "video_a", nullable = false)
    private String videoA;

    @Column(name = "video_b", nullable = false)
    private String videoB;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(nullable = false, columnDefinition = "duel_verdict")
    private Verdict verdict;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected DuelRecord() {
    }

    DuelRecord(UUID sessionId, String videoA, String videoB, Verdict verdict, Instant createdAt) {
        this.sessionId = sessionId;
        this.videoA = videoA;
        this.videoB = videoB;
        this.verdict = verdict;
        this.createdAt = createdAt;
    }

    public Duel toDuel() {
        return new Duel(id, sessionId, videoA, videoB, verdict, createdAt);
    }
}
