package fm.tierlist.duel;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;

// Key of the per-song rows (prior, decision, lock): whose, which board, which video.
@Embeddable
public record BoardSongId(
    @Column(name = "user_id") String userId,
    @Column(name = "board") String board,
    @Column(name = "video_id") String videoId
) implements Serializable {
}
