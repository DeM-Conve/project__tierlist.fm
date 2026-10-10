package fm.tierlist.duel;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

interface DuelDecisionRepository extends JpaRepository<DuelDecision, BoardSongId> {
    List<DuelDecision> findByIdUserIdAndIdBoard(String userId, String board);
}
