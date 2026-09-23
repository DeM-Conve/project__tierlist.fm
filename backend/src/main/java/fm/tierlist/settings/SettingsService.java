package fm.tierlist.settings;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Optional;

@Service
public class SettingsService {

    private final UserSettingsRepository settings;
    private final EntityManager entityManager;

    public SettingsService(UserSettingsRepository settings, EntityManager entityManager) {
        this.settings = settings;
        this.entityManager = entityManager;
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
                             Appearance appearance, Naming naming, Map<String, String> todoLinks, Prefs prefs) {
        Optional<UserSettings> existing = settings.findById(userId);
        if (!precondition.isSatisfiedBy(existing.map(UserSettings::getVersion))) {
            throw new SettingsConflictException();
        }
        UserSettings row = existing.orElseGet(() -> new UserSettings(userId, appearance, naming, todoLinks, prefs));
        // The links table is excluded from Hibernate's automatic versioning
        // (it bumped the version on every insert), so a links change bumps it
        // here - immediately, so the ETag returned below is already the new one.
        if (existing.isPresent() && !row.getTodoLinks().equals(todoLinks)) {
            entityManager.lock(row, LockModeType.PESSIMISTIC_FORCE_INCREMENT);
        }
        row.replace(appearance, naming, todoLinks, prefs);
        return settings.saveAndFlush(row); // flush now so the new version is the ETag we return
    }
}
