package fm.tierlist.settings;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class NamingTemplateValidator implements ConstraintValidator<NamingTemplate, String> {

    private static final Pattern TOKEN = Pattern.compile("\\{([^{}]*)}");
    // A token of the user's own: a single word, named by them.
    private static final Pattern OWN_TOKEN = Pattern.compile("^[A-Za-z][A-Za-z0-9_]{0,19}$");

    @Override
    public boolean isValid(String template, ConstraintValidatorContext context) {
        if (template == null) {
            return true;
        }
        if (template.isBlank() || template.length() > NamingTemplate.MAX_LENGTH) {
            return false;
        }
        // Braces only ever wrap a token.
        if (TOKEN.matcher(template).replaceAll("").matches(".*[{}].*")) {
            return false;
        }
        Map<String, Integer> counts = new HashMap<>();
        Matcher m = TOKEN.matcher(template);
        while (m.find()) {
            String token = m.group(1);
            if (!OWN_TOKEN.matcher(token).matches()) {
                return false;
            }
            counts.merge(token, 1, Integer::sum);
        }
        return counts.getOrDefault("category", 0) == 1
            && counts.getOrDefault("tier", 0) == 1
            && counts.values().stream().allMatch(n -> n == 1);
    }
}
