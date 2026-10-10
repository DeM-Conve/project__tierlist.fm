package fm.tierlist.settings;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Embedded;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapKeyColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.ListIndexJdbcTypeCode;
import org.hibernate.annotations.OptimisticLock;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

// One row per user (`user_settings`). Grouped into the same value objects the
// frontend has slices for, so each group can grow without touching the others.
@Entity
@Table(name = "user_settings")
public class UserSettings {

    @Id
    @Column(name = "user_id")
    private String userId;

    @Embedded
    private Appearance appearance;

    @Embedded
    private Naming naming;

    // Settings -> Playlist naming -> To-do lists: playlist id -> board
    // (category) for to-do lists assigned by hand (`todo_list_link`). Shares
    // the row's version/ETag: SettingsService bumps it when these change
    // (excluded from Hibernate's own versioning, which bumped it on insert).
    @OptimisticLock(excluded = true)
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "todo_list_link", joinColumns = @JoinColumn(name = "user_id"))
    @MapKeyColumn(name = "playlist_id", length = 64)
    @Column(name = "category", nullable = false, length = NamingTemplate.MAX_LENGTH)
    private Map<String, String> todoLinks = new HashMap<>();

    // The user's order of the activity bar's top group (`activity_bar_item`,
    // one row per item, `position` = index). Always complete (every item once -
    // see ActivityItem.completeOrder). Versioned like todoLinks: excluded from
    // Hibernate's own versioning, bumped by SettingsService when it changes.
    @OptimisticLock(excluded = true)
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "activity_bar_item", joinColumns = @JoinColumn(name = "user_id"))
    @OrderColumn(name = "position", nullable = false)
    @ListIndexJdbcTypeCode(SqlTypes.SMALLINT) // the index column is SMALLINT, not Hibernate's default INTEGER
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "item", nullable = false, columnDefinition = "activity_item")
    private List<ActivityItem> activityOrder = new ArrayList<>();

    // Optimistic lock + ETag. A wrapper type so Spring Data treats a fresh
    // entity (null version) as new and INSERTs it instead of merging.
    @Version
    private Long version;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected UserSettings() {
    }

    UserSettings(String userId, Appearance appearance, Naming naming, Map<String, String> todoLinks,
                 List<ActivityItem> activityOrder) {
        this.userId = userId;
        replace(appearance, naming, todoLinks, activityOrder);
    }

    // activityOrder is completed (ActivityItem.completeOrder): null = default.
    void replace(Appearance appearance, Naming naming, Map<String, String> todoLinks, List<ActivityItem> activityOrder) {
        this.appearance = appearance;
        this.naming = naming;
        // Mutated in place: Hibernate tracks (and diffs) its own collection.
        this.todoLinks.clear();
        this.todoLinks.putAll(todoLinks);
        List<ActivityItem> order = ActivityItem.completeOrder(activityOrder);
        if (!this.activityOrder.equals(order)) {
            this.activityOrder.clear();
            this.activityOrder.addAll(order);
        }
    }

    public String getUserId() {
        return userId;
    }

    public Appearance getAppearance() {
        return appearance;
    }

    public Naming getNaming() {
        return naming;
    }

    public Map<String, String> getTodoLinks() {
        return Map.copyOf(todoLinks);
    }

    // Complete even for a row saved before it had one (no rows = default).
    public List<ActivityItem> getActivityOrder() {
        return ActivityItem.completeOrder(activityOrder);
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }
}
