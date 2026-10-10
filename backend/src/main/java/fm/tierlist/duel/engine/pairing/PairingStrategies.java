package fm.tierlist.duel.engine.pairing;

import fm.tierlist.duel.engine.BoardAnalysis;
import fm.tierlist.duel.engine.SongState;

import java.util.EnumMap;
import java.util.Map;

// Registry: one strategy per focus. A new focus = an enum constant + an entry here.
public final class PairingStrategies {

    private final Map<Focus, PairingStrategy> byFocus;

    public PairingStrategies(Map<Focus, PairingStrategy> byFocus) {
        this.byFocus = new EnumMap<>(Focus.class);
        this.byFocus.putAll(byFocus);
    }

    public static PairingStrategies standard() {
        Map<Focus, PairingStrategy> m = new EnumMap<>(Focus.class);
        // Smart mix: whatever settles the most - borderlines, fresh placements, shaky rankings.
        m.put(Focus.SMART_MIX, new BorderPairing((s, a) -> true));
        m.put(Focus.PLACE_TODO, new PlaceTodoPairing());
        m.put(Focus.BORDERLINES, new BorderPairing(PairingStrategies::onFence));
        m.put(Focus.ONE_SONG, new OneSongPairing());
        return new PairingStrategies(m);
    }

    private static boolean onFence(SongState s, BoardAnalysis a) {
        return a.onFence().contains(s.id());
    }

    public PairingStrategy forFocus(Focus focus) {
        PairingStrategy s = byFocus.get(focus);
        if (s == null) throw new IllegalArgumentException("No pairing strategy for " + focus);
        return s;
    }
}
