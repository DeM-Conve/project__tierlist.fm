package fm.tierlist.duel.engine;

import java.time.Instant;
import java.util.List;
import java.util.Map;

// Strategy: re-estimate every song's rating from the whole log at once, so the
// order duels happened in stops mattering. Returns a rating per song with a
// prior or a duel (songs absent from the log keep their prior).
public interface Refitter {
    Map<String, Rating> refit(List<Duel> duels, Map<String, Rating> priors, Instant now);
}
