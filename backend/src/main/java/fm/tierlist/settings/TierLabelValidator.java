package fm.tierlist.settings;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

public class TierLabelValidator implements ConstraintValidator<TierLabel, String> {

    private static final Pattern SYMBOLS = Pattern.compile("[^\\p{L}\\p{N}]+");
    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");

    // A name's words - what the frontend compares (naming.js normalizeName):
    // accents, case and symbols fold away ("(**To do**)" -> "to do").
    static String words(String label) {
        String plain = DIACRITICS.matcher(Normalizer.normalize(label, Normalizer.Form.NFKD)).replaceAll("");
        return SYMBOLS.matcher(plain.toLowerCase(Locale.ROOT)).replaceAll(" ").strip();
    }

    @Override
    public boolean isValid(String label, ConstraintValidatorContext context) {
        if (label == null) {
            return true; // @NotNull's job
        }
        return label.length() <= TierLabel.MAX_LENGTH
            && label.equals(label.strip())
            && !words(label).isEmpty()
            && label.indexOf('{') < 0 && label.indexOf('}') < 0;
    }
}
