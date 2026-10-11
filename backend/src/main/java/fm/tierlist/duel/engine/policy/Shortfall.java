package fm.tierlist.duel.engine.policy;

// Why a move isn't suggested yet: one rule's requirement, what the song has
// (`have`) against what it needs (`need`) - "83% sure, needs 85%".
public record Shortfall(Kind kind, double have, double need) {
    public enum Kind {
        // Not sure enough of the new tier.
        CONFIDENCE,
        // Too few duels behind the song.
        DUELS,
        // Too few distinct opponents from near the border being crossed.
        BORDER_OPPONENTS,
        // Kept earlier: fewer fresh duels pointing the same way since.
        FRESH_DUELS,
        // Locked in its tier.
        LOCKED
    }

    // The user already answered for this song (Keep, or a lock): it isn't
    // shown as "leaning" either - the answer stands until the rule is met.
    public boolean userDecided() {
        return kind == Kind.FRESH_DUELS || kind == Kind.LOCKED;
    }
}
