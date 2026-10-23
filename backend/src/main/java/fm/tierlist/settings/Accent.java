package fm.tierlist.settings;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import com.fasterxml.jackson.databind.exc.InvalidFormatException;

// Accent colours - frontend/src/themes.js ACCENTS.
// Constant names are the labels of the Postgres enum `accent_option` (V1 migration);
// `key` is the id the frontend uses, and what the API speaks.
public enum Accent {
    BLUE("blue"),
    VIOLET("violet"),
    TEAL("teal"),
    GREEN("green"),
    PINK("pink"),
    RED("red"),
    ORANGE("orange"),
    AMBER("amber");

    private final String key;

    Accent(String key) {
        this.key = key;
    }

    @JsonValue
    public String key() {
        return key;
    }

    // By key only - never a number (see FrontendKeys).
    @JsonCreator
    static Accent fromKey(String key) throws InvalidFormatException {
        return FrontendKeys.parse(Accent.class, Accent::key, key);
    }
}
