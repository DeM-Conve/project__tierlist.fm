package fm.tierlist.settings;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

public class TodoKeywordValidator implements ConstraintValidator<TodoKeyword, String> {

    private static final Pattern WORDS = Pattern.compile("^[\\p{L}\\p{N}]+( [\\p{L}\\p{N}]+)*$");
    private static final Set<String> TIER_CODES = Set.of("T1", "T2", "T3", "TE", "TZ");

    @Override
    public boolean isValid(String keyword, ConstraintValidatorContext context) {
        if (keyword == null) {
            return true; // @NotNull's job
        }
        return keyword.length() <= TodoKeyword.MAX_LENGTH
            && WORDS.matcher(keyword).matches()
            && !TIER_CODES.contains(keyword.toUpperCase(Locale.ROOT));
    }
}
