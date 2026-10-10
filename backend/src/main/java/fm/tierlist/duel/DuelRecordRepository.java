package fm.tierlist.duel;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface DuelRecordRepository extends JpaRepository<DuelRecord, Long> {
    // The board's whole log, oldest first.
    @Query("""
        select d from DuelRecord d
        where d.sessionId in (select s.id from DuelSession s where s.userId = :userId and s.board = :board)
        order by d.createdAt, d.id""")
    List<DuelRecord> findBoardLog(@Param("userId") String userId, @Param("board") String board);

    Optional<DuelRecord> findFirstBySessionIdOrderByCreatedAtDescIdDesc(UUID sessionId);

    long countBySessionId(UUID sessionId);
}
