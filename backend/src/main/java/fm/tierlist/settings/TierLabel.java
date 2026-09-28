package fm.tierlist.settings;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

// A tier's name as the user wrote it ("S", "T1", "(**TODO**)"): at most
// MAX_LENGTH, no spaces around it, at least one letter/digit, no template
// braces. Null is valid (combine with @NotNull where required). Mirrors the
// frontend's naming.js validateTierLabels - keep the two in step.
@Documented
@Constraint(validatedBy = TierLabelValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.TYPE_USE})
@Retention(RetentionPolicy.RUNTIME)
public @interface TierLabel {
    int MAX_LENGTH = 20;

    String message() default "must be at most 20 characters with a letter or digit, and no { } or surrounding spaces";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
