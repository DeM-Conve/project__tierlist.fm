package fm.tierlist.duel;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

interface DuelSessionRepository extends JpaRepository<DuelSession, UUID> {
    Optional<DuelSession> findByIdAndUserIdAndBoard(UUID id, String userId, String board);

    Optional<DuelSession> findFirstByUserIdAndBoardAndEndedAtIsNullOrderByStartedAtDesc(String userId, String board);
}
