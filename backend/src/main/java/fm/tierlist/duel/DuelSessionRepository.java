package fm.tierlist.duel;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

interface DuelSessionRepository extends JpaRepository<DuelSession, UUID> {
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query("update DuelSession s set s.board = :to where s.userId = :userId and s.board = :from")
    int moveBoard(@org.springframework.data.repository.query.Param("userId") String userId,
                  @org.springframework.data.repository.query.Param("from") String from,
                  @org.springframework.data.repository.query.Param("to") String to);

    Optional<DuelSession> findByIdAndUserIdAndBoard(UUID id, String userId, String board);

    Optional<DuelSession> findFirstByUserIdAndBoardAndEndedAtIsNullOrderByStartedAtDesc(String userId, String board);
}
