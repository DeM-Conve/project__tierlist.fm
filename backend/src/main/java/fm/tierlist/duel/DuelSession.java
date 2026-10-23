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

    // How long after the time is up the duel that was on screen can still be
    // answered (or its answer taken back and given again): the clock ran out
    // while you listened - that verdict still counts. No new duel is offered.
    static final Duration ANSWER_GRACE = Duration.ofMinutes(2);

    public boolean takesAnswers(Instant now) {
        return endedAt == null && now.isBefore(endsAt().plus(ANSWER_GRACE));
    }

    // Ended at `at`, but never later than the time was up: a session left
    // open and ended (or summarised) much later still lasted its length.
    void end(Instant at) {
        if (endedAt != null) return;
        Instant last = at.isAfter(endsAt()) ? endsAt() : at;
        endedAt = last.isBefore(startedAt) ? startedAt : last;
    }
}
