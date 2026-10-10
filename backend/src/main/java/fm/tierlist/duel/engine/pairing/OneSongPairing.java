package fm.tierlist.duel.engine.pairing;

import fm.tierlist.duel.engine.BoardAnalysis;
import fm.tierlist.duel.engine.EngineConfig;
import fm.tierlist.duel.engine.SongState;

import java.util.Optional;

// One pinned song until its spot is found: ceil(log2(tiers)) + 2 duels this
// session with a clear tier, or the cap.
public final class OneSongPairing extends BinarySearchPairing {
    @Override
    protected Optional<SongState> subject(BoardAnalysis analysis, SessionContext session, EngineConfig config) {
        SongState s = session.songId() == null ? null : analysis.song(session.songId());
        if (s == null) return Optional.empty();
        long done = session.sessionDuelsWith(s.id());
        int enough = (int) Math.ceil(Math.log(Math.max(2, analysis.layout().rankedTiers().size())) / Math.log(2)) + 2;
        boolean found = done >= enough && s.bestProbability() >= config.moveThreshold();
        return found || done >= config.oneSongMaxDuels() ? Optional.empty() : Optional.of(s);
    }
}
