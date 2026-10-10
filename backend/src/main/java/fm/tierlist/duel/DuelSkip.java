package fm.tierlist.duel;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.util.UUID;

// "Don't know one of them": `videoId` isn't offered again in that session.
@Entity
@Table(name = "duel_skip")
public class DuelSkip {

    @Embeddable
    public record Key(@Column(name = "session_id") UUID sessionId, @Column(name = "video_id") String videoId) implements Serializable {
    }

    @EmbeddedId
    private Key id;

    protected DuelSkip() {
    }

    DuelSkip(UUID sessionId, String videoId) {
        this.id = new Key(sessionId, videoId);
    }

    public String getVideoId() {
        return id.videoId();
    }
}
