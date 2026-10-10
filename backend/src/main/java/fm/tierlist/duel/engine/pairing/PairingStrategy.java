package fm.tierlist.duel.engine.pairing;

import fm.tierlist.duel.engine.BoardAnalysis;
import fm.tierlist.duel.engine.EngineConfig;
import fm.tierlist.duel.engine.RatingModel;

import java.util.Optional;

// Strategy: which duel to ask next. Empty = nothing left worth asking.
public interface PairingStrategy {
    Optional<Matchup> next(BoardAnalysis analysis, SessionContext session, RatingModel model, EngineConfig config);
}
