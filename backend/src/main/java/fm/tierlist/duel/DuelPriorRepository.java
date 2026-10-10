package fm.tierlist.duel;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

interface DuelPriorRepository extends JpaRepository<DuelPrior, BoardSongId> {
    List<DuelPrior> findByIdUserIdAndIdBoard(String userId, String board);
}
