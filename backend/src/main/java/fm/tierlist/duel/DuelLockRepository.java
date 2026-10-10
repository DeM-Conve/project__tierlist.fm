package fm.tierlist.duel;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

interface DuelLockRepository extends JpaRepository<DuelLock, BoardSongId> {
    List<DuelLock> findByIdUserIdAndIdBoard(String userId, String board);
}
