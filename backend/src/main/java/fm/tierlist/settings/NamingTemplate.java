package fm.tierlist.settings;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

// A playlist naming template, same grammar as frontend/src/naming.js
// validateTemplate(): {category} and {tier} exactly once, any other {word}
// is a token of the user's own (at most once each), braces only around a
// token. Null is valid (combine with @NotNull where required).
@Documented
@Constraint(validatedBy = NamingTemplateValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.TYPE_USE})
@Retention(RetentionPolicy.RUNTIME)
public @interface NamingTemplate {

    int MAX_LENGTH = 200;

    String message() default "must use {category} and {tier} once each, and other tokens ({word}) at most once each";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
