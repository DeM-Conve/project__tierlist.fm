-- Settings -> Duels -> Tier borders: where the duel engine draws the line
-- between tiers. LEARNED (the default, and every existing row): fitted from
-- where the user put songs. CUSTOM: the user's own ranges - each ranked
-- tier's lowest score, on the score the duel pages show (engine mu x 10,
-- fm.tierlist.duel.engine.ScoreScale). D has none: it is everything below C.
-- The minimums are kept when the user goes back to LEARNED, so switching back
-- restores them; all four or none.
CREATE TYPE duel_tier_borders AS ENUM ('LEARNED', 'CUSTOM');

ALTER TABLE user_settings
    ADD COLUMN duel_tier_borders duel_tier_borders NOT NULL DEFAULT 'LEARNED',
    ADD COLUMN duel_tier_s_min   INTEGER,
    ADD COLUMN duel_tier_a_min   INTEGER,
    ADD COLUMN duel_tier_b_min   INTEGER,
    ADD COLUMN duel_tier_c_min   INTEGER,
    ADD CONSTRAINT duel_tier_min_all_or_none
        CHECK (num_nulls(duel_tier_s_min, duel_tier_a_min, duel_tier_b_min, duel_tier_c_min) IN (0, 4)),
    ADD CONSTRAINT duel_tier_min_for_custom
        CHECK (duel_tier_borders = 'LEARNED' OR duel_tier_s_min IS NOT NULL),
    -- Strictly descending: every tier keeps a range of at least one point.
    ADD CONSTRAINT duel_tier_min_descending
        CHECK (duel_tier_s_min > duel_tier_a_min AND duel_tier_a_min > duel_tier_b_min
               AND duel_tier_b_min > duel_tier_c_min),
    ADD CONSTRAINT duel_tier_min_range
        CHECK (duel_tier_c_min >= 0 AND duel_tier_s_min <= 1000);
