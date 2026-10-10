package fm.tierlist.duel;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;

// A song locked in its tier (`duel_lock`).
@Entity
@Table(name = "duel_lock")
public class DuelLock {

    @EmbeddedId
    private BoardSongId id;

    @Column(name = "locked_at", nullable = false)
    private Instant lockedAt;

    protected DuelLock() {
    }

    DuelLock(BoardSongId id, Instant lockedAt) {
        this.id = id;
        this.lockedAt = lockedAt;
    }

    public String getVideoId() {
        return id.videoId();
    }
}
