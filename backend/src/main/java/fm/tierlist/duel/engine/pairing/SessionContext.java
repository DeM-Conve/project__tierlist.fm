package fm.tierlist.duel.engine.pairing;

import fm.tierlist.duel.engine.Duel;

import java.util.List;
import java.util.Set;
import java.util.random.RandomGenerator;

/**
 * What pairing needs to know about the session in progress.
 *
 * @param songId       the pinned song (ONE_SONG only)
 * @param sessionDuels this session's duels, oldest first
 * @param skipped      songs the user said they don't know - never offered again this session
 * @param recentDuels  the board's latest duels (any session), oldest first, for the repeat penalty
 * @param random       randomness for Thompson sampling (seeded in tests)
 */
public record SessionContext(
    Focus focus,
    String songId,
    List<Duel> sessionDuels,
    Set<String> skipped,
    List<Duel> recentDuels,
    RandomGenerator random
) {
    // The song on side A last time - pairing keeps a song on for a few duels
    // so you're not switching songs every duel.
    public String lastSubject() {
        return sessionDuels.isEmpty() ? null : sessionDuels.get(sessionDuels.size() - 1).a();
    }

    // How many duels in a row (at the end of the session) had `id` on side A.
    public int run(String id) {
        int n = 0;
        for (int i = sessionDuels.size() - 1; i >= 0 && sessionDuels.get(i).a().equals(id); i--) n++;
        return n;
    }

    public long sessionDuelsWith(String id) {
        return sessionDuels.stream().filter(d -> d.involves(id)).count();
    }
}
