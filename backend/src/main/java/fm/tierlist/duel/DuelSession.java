package fm.tierlist.duel;

import fm.tierlist.duel.engine.pairing.Focus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "duel_session")
public class DuelSession {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(nullable = false)
    private String board;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(nullable = false, columnDefinition = "duel_focus")
    private Focus focus;

    @Column(nullable = false)
    private short minutes;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "ended_at")
    private Instant endedAt;

    @Column(name = "certainty_start", nullable = false)
    private float certaintyStart;

    protected DuelSession() {
    }

    DuelSession(String userId, String board, Focus focus, int minutes, Instant startedAt, double certaintyStart) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.board = board;
        this.focus = focus;
        this.minutes = (short) minutes;
        this.startedAt = startedAt;
        this.certaintyStart = (float) certaintyStart;
    }

    public UUID getId() { return id; }
    public String getUserId() { return userId; }
    public String getBoard() { return board; }
    public Focus getFocus() { return focus; }
    public int getMinutes() { return minutes; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getEndedAt() { return endedAt; }
    public double getCertaintyStart() { return certaintyStart; }

    public Instant endsAt() {
        return startedAt.plus(Duration.ofMinutes(minutes));
    }

    public boolean isOpen(Instant now) {
        return endedAt == null && now.isBefore(endsAt());
    }

    void end(Instant at) {
        if (endedAt == null) endedAt = at.isBefore(startedAt) ? startedAt : at;
    }
}
