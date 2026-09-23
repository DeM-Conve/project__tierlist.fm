package fm.tierlist.settings;

import fm.tierlist.user.AppUserService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// The signed-in user's settings, stored in Postgres so they follow the Google
// account across browsers. The row's version is its ETag; writes are
// conditional (If-Match / If-None-Match: *) - see WritePrecondition.
@RestController
@RequestMapping("/api/settings")
public class SettingsController {

    private final AppUserService users;
    private final SettingsService settings;

    public SettingsController(AppUserService users, SettingsService settings) {
        this.users = users;
        this.settings = settings;
    }

    // 204 when the account has never saved (the frontend then uploads this
    // browser's settings with If-None-Match: *).
    @GetMapping
    public ResponseEntity<SettingsDto> get(Authentication auth) {
        return settings.find(auth.getName())
            .map(SettingsController::ok)
            .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping
    public ResponseEntity<SettingsDto> put(
        @Valid @RequestBody SettingsDto dto,
        @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
        @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
        Authentication auth
    ) {
        WritePrecondition precondition = WritePrecondition.fromHeaders(ifMatch, ifNoneMatch);
        String userId = users.current(auth).getId();
        return ok(settings.save(userId, precondition, dto.toAppearance(), dto.toNaming(), dto.toTodoLinks(), dto.toPrefs()));
    }

    private static ResponseEntity<SettingsDto> ok(UserSettings row) {
        return ResponseEntity.ok().eTag(Long.toString(row.getVersion())).body(SettingsDto.from(row));
    }
}
