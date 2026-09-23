package fm.tierlist.user;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

// The signed-in user's app settings, stored in Postgres so they follow the
// Google account across browsers/devices.
@RestController
public class SettingsController {

    private final AppUserService users;
    private final UserSettingsRepository settings;

    public SettingsController(AppUserService users, UserSettingsRepository settings) {
        this.users = users;
        this.settings = settings;
    }

    // 204 when this account has never saved settings (the frontend then
    // uploads the ones this browser has).
    @GetMapping("/api/settings")
    public ResponseEntity<SettingsDto> get(Authentication auth) {
        return settings.findById(auth.getName())
            .map(s -> ResponseEntity.ok(s.toDto()))
            .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping("/api/settings")
    @Transactional
    public SettingsDto put(@Valid @RequestBody SettingsDto dto, Authentication auth) {
        String userId = users.current(auth).getId();
        UserSettings row = settings.findById(userId).orElseGet(() -> new UserSettings(userId));
        row.apply(dto);
        return settings.save(row).toDto();
    }
}
