package fm.tierlist.settings;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

// The to-do list keyword: one or more words of letters/digits (single spaces
// between), at most MAX_LENGTH, and not a tier code. Mirrors the frontend's
// todoLists.js validateTodoKeyword - keep the two in step.
@Documented
@Constraint(validatedBy = TodoKeywordValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.TYPE_USE})
@Retention(RetentionPolicy.RUNTIME)
public @interface TodoKeyword {
    int MAX_LENGTH = 20;

    String message() default "must be words of letters/digits, at most 20 characters, and not a tier code";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
