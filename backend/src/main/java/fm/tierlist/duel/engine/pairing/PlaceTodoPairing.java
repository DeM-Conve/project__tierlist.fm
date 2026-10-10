package fm.tierlist.duel.engine.pairing;

import fm.tierlist.duel.engine.BoardAnalysis;
import fm.tierlist.duel.engine.EngineConfig;
import fm.tierlist.duel.engine.SongState;

import java.util.Objects;
import java.util.Optional;

// To-do songs one after another, in the to-do list's order: no tier guess -
// each meets anchors from across the board and lands where it wins.
public final class PlaceTodoPairing extends BinarySearchPairing {
    @Override
    protected Optional<SongState> subject(BoardAnalysis analysis, SessionContext session, EngineConfig config) {
        String last = session.lastSubject();
        SongState current = last == null ? null : analysis.song(last);
        if (current != null && current.tier() == null && !session.skipped().contains(last)
            && !settled(current, config.placeMaxDuels(), config)) {
            return Optional.of(current);
        }
        return analysis.layout().unranked().stream()
            .filter(id -> !session.skipped().contains(id) && !analysis.locks().contains(id))
            .map(analysis::song)
            .filter(Objects::nonNull)
            .filter(s -> !settled(s, config.placeMaxDuels(), config))
            .findFirst();
    }
}
