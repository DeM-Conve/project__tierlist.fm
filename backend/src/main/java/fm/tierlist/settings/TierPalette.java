package fm.tierlist.settings;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import com.fasterxml.jackson.databind.exc.InvalidFormatException;

// Tier colour sets - frontend/src/themes.js TIER_PALETTES.
// Constant names are the labels of the Postgres enum `tier_palette_option` (V1 migration);
// `key` is the id the frontend uses, and what the API speaks.
public enum TierPalette {
    VIVID("vivid"),
    CLASSIC("classic"),
    HEAT("heat");

    private final String key;

    TierPalette(String key) {
        this.key = key;
    }

    @JsonValue
    public String key() {
        return key;
    }

    // By key only - never a number (see FrontendKeys).
    @JsonCreator
    static TierPalette fromKey(String key) throws InvalidFormatException {
        return FrontendKeys.parse(TierPalette.class, TierPalette::key, key);
    }
}
