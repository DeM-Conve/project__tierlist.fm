package fm.tierlist.settings;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
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

    // The user's duel settings (the default for an account that never saved).
    @Transactional(readOnly = true)
    public DuelSettings duels(String userId) {
        return settings.findById(userId).map(UserSettings::getDuels).orElse(DuelSettings.DEFAULT);
    }

    // Creates or replaces the user's settings if `precondition` holds, else
    // SettingsConflictException. Two writes racing past the check still can't
    // both win: @Version (update) / the primary key (insert) rejects the
    // loser at flush - see SettingsExceptionHandler.
    @Transactional
    public UserSettings save(String userId, WritePrecondition precondition,
                             Appearance appearance, Naming naming, Map<String, String> todoLinks,
                             List<ActivityItem> activityOrder) {
        return save(userId, precondition, appearance, naming, todoLinks, activityOrder, null);
    }

    // `duels` null = keep the row's (or the default, for a new row).
    @Transactional
    public UserSettings save(String userId, WritePrecondition precondition,
                             Appearance appearance, Naming naming, Map<String, String> todoLinks,
                             List<ActivityItem> activityOrder, DuelSettings duels) {
        Optional<UserSettings> existing = settings.findById(userId);
        if (!precondition.isSatisfiedBy(existing.map(UserSettings::getVersion))) {
            throw new SettingsConflictException();
        }
        UserSettings row = existing.orElseGet(() -> new UserSettings(userId, appearance, naming, todoLinks, activityOrder));
        // The links and activity-bar tables are excluded from Hibernate's
        // automatic versioning (it bumped the version on every insert), so a
        // change to either bumps it here - immediately, so the ETag returned
        // below is already the new one.
        if (existing.isPresent() && (!row.getTodoLinks().equals(todoLinks)
            || !row.getActivityOrder().equals(ActivityItem.completeOrder(activityOrder)))) {
            entityManager.lock(row, LockModeType.PESSIMISTIC_FORCE_INCREMENT);
        }
        row.replace(appearance, naming, todoLinks, activityOrder);
        row.replaceDuels(duels);
        return settings.saveAndFlush(row); // flush now so the new version is the ETag we return
    }
}
