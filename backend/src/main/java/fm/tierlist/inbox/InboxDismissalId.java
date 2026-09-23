package fm.tierlist.inbox;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;

@Embeddable
public record InboxDismissalId(
    @Column(name = "user_id") String userId,
    @Column(name = "video_id") String videoId
) implements Serializable {
}
