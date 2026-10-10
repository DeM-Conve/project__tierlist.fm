package fm.tierlist.duel;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

interface DuelSkipRepository extends JpaRepository<DuelSkip, DuelSkip.Key> {
    List<DuelSkip> findByIdSessionId(UUID sessionId);
}
