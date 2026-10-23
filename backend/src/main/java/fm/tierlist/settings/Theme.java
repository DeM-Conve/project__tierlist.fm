package fm.tierlist.settings;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import com.fasterxml.jackson.databind.exc.InvalidFormatException;

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

    // By key only - never a number (see FrontendKeys).
    @JsonCreator
    static Theme fromKey(String key) throws InvalidFormatException {
        return FrontendKeys.parse(Theme.class, Theme::key, key);
    }
}
