package fm.tierlist.duel.engine.pairing;

// What a session sharpens - each maps to one PairingStrategy (PairingStrategies).
public enum Focus {
    SMART_MIX,
    /**
     * Retired: the old "Place TODO songs" mode. To-do songs are never part of
     * duels any more (the user's call) - the user places them. The constant
     * stays only because it is still a `duel_focus` label in V1 and older
     * sessions may carry it: such a session reads fine, and one still open
     * plays as Smart mix. A new session can't be started with it.
     */
    @Deprecated
    PLACE_TODO,
    BORDERLINES;

    @SuppressWarnings("deprecation")
    public boolean retired() {
        return this == PLACE_TODO;
    }
}
