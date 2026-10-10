package fm.tierlist.duel.engine;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

// The board as the user sees it right now (staged edits included): the ranked
// tiers best first, the unranked to-do list, and the songs in each, in order.
// Tier ids are opaque to the engine ("S".."D", "TODO").
public record BoardLayout(List<String> rankedTiers, String unrankedTier, Map<String, List<String>> songs) {

    public BoardLayout {
        rankedTiers = List.copyOf(rankedTiers);
        Map<String, List<String>> copy = new LinkedHashMap<>();
        songs.forEach((tier, ids) -> copy.put(tier, List.copyOf(ids)));
        songs = copy;
    }

    public List<String> songsIn(String tier) {
        return songs.getOrDefault(tier, List.of());
    }

    public List<String> unranked() {
        return unrankedTier == null ? List.of() : songsIn(unrankedTier);
    }

    // Ranked songs, best tier first, each tier in board order.
    public List<String> ranked() {
        List<String> out = new ArrayList<>();
        rankedTiers.forEach(t -> out.addAll(songsIn(t)));
        return out;
    }

    // Every song's tier; the first copy wins for a song listed twice.
    public Map<String, String> tierOf() {
        Map<String, String> map = new HashMap<>();
        for (String tier : rankedTiers) songsIn(tier).forEach(id -> map.putIfAbsent(id, tier));
        unranked().forEach(id -> map.putIfAbsent(id, unrankedTier));
        return map;
    }

    public Optional<Integer> rankOf(String tier) {
        int i = tier == null ? -1 : rankedTiers.indexOf(tier);
        return i < 0 ? Optional.empty() : Optional.of(i);
    }

    public boolean isRanked(String tier) {
        return tier != null && rankedTiers.contains(tier);
    }
}
