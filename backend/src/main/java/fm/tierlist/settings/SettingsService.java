package fm.tierlist.settings;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
public class SettingsService {

    private final UserSettingsRepository settings;

    public SettingsService(UserSettingsRepository settings) {
        this.settings = settings;
    }

    @Transactional(readOnly = true)
    public Optional<UserSettings> find(String userId) {
        return settings.findById(userId);
    }

    // Creates or replaces the user's settings if `precondition` holds, else
    // SettingsConflictException. Two writes racing past the check still can't
    // both win: @Version (update) / the primary key (insert) rejects the
    // loser at flush - see SettingsExceptionHandler.
    @Transactional
    public UserSettings save(String userId, WritePrecondition precondition,
                             Appearance appearance, Naming naming, Prefs prefs) {
        Optional<UserSettings> existing = settings.findById(userId);
        if (!precondition.isSatisfiedBy(existing.map(UserSettings::getVersion))) {
            throw new SettingsConflictException();
        }
        UserSettings row = existing.orElseGet(() -> new UserSettings(userId, appearance, naming, prefs));
        row.replace(appearance, naming, prefs);
        return settings.saveAndFlush(row); // flush now so the new version is the ETag we return
    }
}
