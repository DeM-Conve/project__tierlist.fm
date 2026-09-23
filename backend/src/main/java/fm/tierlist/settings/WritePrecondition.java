package fm.tierlist.settings;

import org.springframework.http.ETag;
import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;

import java.util.List;
import java.util.Optional;

// What a client asserts about the stored row before overwriting it (RFC 9110
// conditional requests). Every settings write must carry one, so no client can
// blindly overwrite a change it never saw.
public sealed interface WritePrecondition {

    // `If-None-Match: *` - create only; the account must not have a row yet.
    record MustNotExist() implements WritePrecondition {
    }

    // `If-Match: "<version>"` - update only the version the client last read.
    record MustMatch(long version) implements WritePrecondition {
    }

    // True if `current` (the stored row's version, empty when there's no row)
    // satisfies this precondition.
    default boolean isSatisfiedBy(Optional<Long> current) {
        return switch (this) {
            case MustNotExist ignored -> current.isEmpty();
            case MustMatch(long version) -> current.filter(v -> v == version).isPresent();
        };
    }

    static WritePrecondition fromHeaders(String ifMatch, String ifNoneMatch) {
        if (ifMatch != null) {
            List<ETag> tags = ETag.parse(ifMatch);
            if (tags.size() == 1 && !tags.get(0).isWildcard() && !tags.get(0).weak()) {
                try {
                    return new MustMatch(Long.parseLong(tags.get(0).tag()));
                } catch (NumberFormatException ignored) {
                    // fall through: not one of our ETags
                }
            }
            throw new ErrorResponseException(HttpStatus.PRECONDITION_FAILED);
        }
        if (ifNoneMatch != null && ETag.parse(ifNoneMatch).stream().anyMatch(ETag::isWildcard)) {
            return new MustNotExist();
        }
        throw new ErrorResponseException(HttpStatus.PRECONDITION_REQUIRED);
    }
}
