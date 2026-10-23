package fm.tierlist.settings;

import com.fasterxml.jackson.databind.exc.InvalidFormatException;

import java.util.function.Function;

// Reads an option from JSON by its frontend key only. Jackson's own enum
// reading also takes a bare number - or a numeric string - as the constant's
// ordinal ({"theme": 0} saved tokyo), so the API didn't only speak the keys,
// and reordering a Java enum would silently change what a number meant.
// Each option enum's @JsonCreator goes through here instead.
final class FrontendKeys {

    private FrontendKeys() {
    }

    static <E extends Enum<E>> E parse(Class<E> type, Function<E, String> key, String value) throws InvalidFormatException {
        for (E option : type.getEnumConstants()) {
            if (key.apply(option).equals(value)) return option;
        }
        throw InvalidFormatException.from(null, "not one of the " + type.getSimpleName() + " keys", value, type);
    }
}
