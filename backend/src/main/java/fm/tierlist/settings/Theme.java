package fm.tierlist.settings;

import com.fasterxml.jackson.annotation.JsonValue;

// Chrome themes - frontend/src/themes.js THEMES.
// Constant names are the labels of the Postgres enum `theme_option` (V1 migration);
// `key` is the id the frontend uses, and what the API speaks.
public enum Theme {
    TOKYO("tokyo"),
    DRACULA("dracula"),
    CHARCOAL("charcoal"),
    PAPER("paper"),
    SAND("sand"),
    SOLARIZED("solarized");

    private final String key;

    Theme(String key) {
        this.key = key;
    }

    @JsonValue
    public String key() {
        return key;
    }
}
