package fm.tierlist.duel;

// A board's tier slots (frontend tiers.js BOARD_TIERS): the five ranked tiers
// best first, then the unranked to-do list. Constant names = the Postgres enum
// `tier_slot` labels and the keys the API speaks.
public enum TierSlot {
    S, A, B, C, D, TODO;

    public boolean ranked() {
        return this != TODO;
    }
}
