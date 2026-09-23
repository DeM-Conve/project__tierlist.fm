package fm.tierlist.settings;

import com.fasterxml.jackson.annotation.JsonValue;

// Tier board layout - frontend/src/store/prefsSlice.js BOARD_DENSITIES.
// Constant names are the labels of the Postgres enum `board_density_option` (V1 migration);
// `key` is the id the frontend uses, and what the API speaks.
public enum BoardDensity {
    ALL("all"),
    COMPACT("compact");

    private final String key;

    BoardDensity(String key) {
        this.key = key;
    }

    @JsonValue
    public String key() {
        return key;
    }
}
