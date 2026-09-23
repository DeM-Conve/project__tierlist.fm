package fm.tierlist.settings;

import com.fasterxml.jackson.annotation.JsonValue;

// Duel ranking algorithms - frontend/src/duel/index.js DUEL_STRATEGIES.
// Constant names are the labels of the Postgres enum `duel_strategy_option` (V1 migration);
// `key` is the id the frontend uses, and what the API speaks.
public enum DuelStrategy {
    TIER_AWARE_MERGE("tierAwareMerge"),
    MERGE_SORT("mergeSort"),
    ELO("elo");

    private final String key;

    DuelStrategy(String key) {
        this.key = key;
    }

    @JsonValue
    public String key() {
        return key;
    }
}
