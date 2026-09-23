package fm.tierlist.inbox;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface InboxDismissalRepository extends JpaRepository<InboxDismissal, InboxDismissalId> {

    List<InboxDismissal> findByIdUserIdOrderByDismissedAtDesc(String userId);
}
