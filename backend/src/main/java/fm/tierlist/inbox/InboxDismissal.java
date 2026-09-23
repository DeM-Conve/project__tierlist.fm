package fm.tierlist.inbox;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;

// A liked video the user said isn't a song ("Not a song" in the Inbox).
@Entity
@Table(name = "inbox_dismissal")
public class InboxDismissal {

    @EmbeddedId
    private InboxDismissalId id;

    @Column(name = "dismissed_at", nullable = false, updatable = false)
    private OffsetDateTime dismissedAt;

    protected InboxDismissal() {
    }

    public InboxDismissal(String userId, String videoId) {
        this.id = new InboxDismissalId(userId, videoId);
        this.dismissedAt = OffsetDateTime.now();
    }

    public String getVideoId() {
        return id.videoId();
    }
}
