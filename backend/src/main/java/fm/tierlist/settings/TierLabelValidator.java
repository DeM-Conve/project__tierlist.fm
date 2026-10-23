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

    // What the database's tier_label_valid / tier_labels_distinct see (V1):
    // Postgres' [[:alnum:]] counts letters, decimal digits and letter-like
    // numerals ("Ⅻ"), but not what NFKD folds into a digit (circled "①",
    // superscript "²") - checked against postgres:17-alpine. A name must pass
    // both readings, or a save the validator let through fails the CHECK.
    private static final Pattern DB_ALNUM = Pattern.compile("[\\p{L}\\p{Nd}\\p{Nl}]");
    private static final Pattern DB_SYMBOLS = Pattern.compile("[^\\p{L}\\p{Nd}\\p{Nl}]+");

    // tier_labels_distinct's key: lower case, every run of non-alnum one space.
    static String databaseWords(String label) {
        return DB_SYMBOLS.matcher(label.toLowerCase(Locale.ROOT)).replaceAll(" ").strip();
    }

    @Override
    public boolean isValid(String label, ConstraintValidatorContext context) {
        if (label == null) {
            return true; // @NotNull's job
        }
        return label.length() <= TierLabel.MAX_LENGTH
            && label.equals(label.strip())
            && !words(label).isEmpty()
            && DB_ALNUM.matcher(label).find()
            && label.indexOf('{') < 0 && label.indexOf('}') < 0;
    }
}
