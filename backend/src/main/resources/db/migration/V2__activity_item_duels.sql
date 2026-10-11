-- The activity bar's Duels view (frontend activityOrder.js 'duels',
-- ActivityItem.DUELS). Appended, so an account's saved order - which lists
-- only the items it knew - completes with Duels at the end of its group.
ALTER TYPE activity_item ADD VALUE 'DUELS';
