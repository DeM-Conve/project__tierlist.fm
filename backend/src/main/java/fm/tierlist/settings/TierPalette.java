package fm.tierlist.settings;

import com.fasterxml.jackson.annotation.JsonValue;

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
}
