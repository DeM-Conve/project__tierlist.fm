package fm.tierlist.duel.engine;

import java.util.List;
import java.util.Map;

// Strategy: the order a tier's songs should be in, given their ratings - or
// the board's own order when the evidence doesn't say otherwise.
public interface TierOrderPolicy {
    List<String> order(List<String> boardOrder, Map<String, SongState> songs);
}
