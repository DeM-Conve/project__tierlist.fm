package fm.tierlist.inbox;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class InboxService {

    private final InboxDismissalRepository dismissals;

    public InboxService(InboxDismissalRepository dismissals) {
        this.dismissals = dismissals;
    }

    @Transactional(readOnly = true)
    public List<String> dismissedVideoIds(String userId) {
        return dismissals.findByIdUserIdOrderByDismissedAtDesc(userId).stream()
            .map(InboxDismissal::getVideoId)
            .toList();
    }

    // Idempotent: dismissing an already-dismissed video keeps the first row.
    @Transactional
    public void dismiss(String userId, String videoId) {
        if (!dismissals.existsById(new InboxDismissalId(userId, videoId))) {
            dismissals.save(new InboxDismissal(userId, videoId));
        }
    }

    @Transactional
    public void restore(String userId, String videoId) {
        dismissals.deleteById(new InboxDismissalId(userId, videoId));
    }
}
