package fm.tierlist.settings;

import com.fasterxml.jackson.annotation.JsonValue;

// Settings -> Duels -> Tier borders - frontend duel/tierRanges.js BORDER_MODES.
// Constant names are the labels of the Postgres enum `duel_tier_borders` (V3);
// `key` is the id the frontend uses, and what the API speaks.
public enum TierBorderMode {
    // Fitted from where the user put songs (OrdinalProbitTierModel).
    LEARNED("learned"),
    // The user's own ranges (FixedCutpointsTierModel).
    CUSTOM("custom");

    private final String key;

    TierBorderMode(String key) {
        this.key = key;
    }

    @JsonValue
    public String key() {
        return key;
    }
}
