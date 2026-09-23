package fm.tierlist.settings;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class NamingTemplateValidator implements ConstraintValidator<NamingTemplate, String> {

    private static final Pattern TOKEN = Pattern.compile("\\{([^{}]*)}");

    // token -> {min, max} occurrences
    private static final Map<String, int[]> TOKENS = Map.of(
        "category", new int[] {1, 1},
        "tier", new int[] {1, 1},
        "tag", new int[] {0, 1}
    );

    @Override
    public boolean isValid(String template, ConstraintValidatorContext context) {
        if (template == null) {
            return true;
        }
        if (template.isBlank() || template.length() > NamingTemplate.MAX_LENGTH) {
            return false;
        }
        Map<String, Integer> counts = new HashMap<>();
        Matcher m = TOKEN.matcher(template);
        while (m.find()) {
            String token = m.group(1);
            if (!TOKENS.containsKey(token)) {
                return false;
            }
            counts.merge(token, 1, Integer::sum);
        }
        return TOKENS.entrySet().stream().allMatch(e -> {
            int n = counts.getOrDefault(e.getKey(), 0);
            return n >= e.getValue()[0] && n <= e.getValue()[1];
        });
    }
}
