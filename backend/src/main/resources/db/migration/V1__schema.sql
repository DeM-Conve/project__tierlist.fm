-- A signed-in Google account. `id` is Google's stable subject id (the
-- OpenID `sub` claim), so it never changes even if the name/email does.
CREATE TABLE app_user (
    id             TEXT        PRIMARY KEY,
    display_name   TEXT,
    picture_url    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every settings option set is a native Postgres enum, so the database itself
-- refuses a value the app doesn't know. Labels are the Java enum constant
-- names (Hibernate NAMED_ENUM); the API speaks the frontend's keys ("tokyo",
-- "tierAwareMerge") - see the enums in fm.tierlist.settings.
-- New option = `ALTER TYPE ... ADD VALUE` in a new migration + Java constant
-- + frontend catalogue entry.
CREATE TYPE theme_option         AS ENUM ('TOKYO', 'DRACULA', 'CHARCOAL', 'PAPER', 'SAND', 'SOLARIZED');
CREATE TYPE accent_option        AS ENUM ('BLUE', 'VIOLET', 'TEAL', 'GREEN', 'PINK', 'RED', 'ORANGE', 'AMBER');
CREATE TYPE tier_palette_option  AS ENUM ('VIVID', 'CLASSIC', 'HEAT');
CREATE TYPE duel_strategy_option AS ENUM ('TIER_AWARE_MERGE', 'MERGE_SORT', 'ELO');

-- A tier's name as the user wrote it ("S", "T1", "(**TODO**)"). Mirrors
-- @TierLabel / naming.js validateTierLabels: no surrounding spaces, a
-- letter/digit, no template braces (length is the column's).
CREATE FUNCTION tier_label_valid(label TEXT) RETURNS BOOLEAN
    LANGUAGE sql IMMUTABLE STRICT
    RETURN label = btrim(label) AND label ~ '[[:alnum:]]' AND label !~ '[{}]';

-- True when no two names are the same, case and symbols aside ("TODO" and
-- "(**todo**)" count as one) - they'd be indistinguishable in a playlist name.
CREATE FUNCTION tier_labels_distinct(VARIADIC labels TEXT[]) RETURNS BOOLEAN
    LANGUAGE sql IMMUTABLE STRICT
    RETURN (SELECT count(DISTINCT btrim(regexp_replace(lower(l), '[^[:alnum:]]+', ' ', 'g'))) = count(*)
            FROM unnest(labels) AS l);

-- One row per user: their app settings. No row = the account has never saved.
CREATE TABLE user_settings (
    user_id                TEXT                 PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    -- Settings -> Appearance
    theme                  theme_option         NOT NULL,
    accent                 accent_option        NOT NULL,
    tier_palette           tier_palette_option  NOT NULL,
    -- Settings -> Playlist naming: the template, and what each tier is called
    -- (the five ranked tiers best first, then the to-do list - whose name is
    -- also what marks a playlist as a board's to-do list, wherever it appears).
    naming_template        VARCHAR(200)         NOT NULL,
    naming_tier_s          VARCHAR(20)          NOT NULL,
    naming_tier_a          VARCHAR(20)          NOT NULL,
    naming_tier_b          VARCHAR(20)          NOT NULL,
    naming_tier_c          VARCHAR(20)          NOT NULL,
    naming_tier_d          VARCHAR(20)          NOT NULL,
    naming_tier_todo       VARCHAR(20)          NOT NULL,
    -- What the app shows for each tier ("TODO" for "(**TODO**)"); NULL = the
    -- name above. Never matched, so they may repeat.
    naming_tier_s_shown    VARCHAR(20),
    naming_tier_a_shown    VARCHAR(20),
    naming_tier_b_shown    VARCHAR(20),
    naming_tier_c_shown    VARCHAR(20),
    naming_tier_d_shown    VARCHAR(20),
    naming_tier_todo_shown VARCHAR(20),
    -- The previous naming while a rename job is unfinished (titles matching
    -- either stay visible): all of it, or none.
    naming_migrating_from           VARCHAR(200),
    naming_migrating_from_tier_s    VARCHAR(20),
    naming_migrating_from_tier_a    VARCHAR(20),
    naming_migrating_from_tier_b    VARCHAR(20),
    naming_migrating_from_tier_c    VARCHAR(20),
    naming_migrating_from_tier_d    VARCHAR(20),
    naming_migrating_from_tier_todo VARCHAR(20),
    -- Settings -> Duels
    duel_strategy          duel_strategy_option NOT NULL,
    -- Optimistic lock, served as the ETag: a save based on a version the
    -- client never saw gets 412 instead of overwriting another device's change.
    version                BIGINT               NOT NULL DEFAULT 0,
    updated_at             TIMESTAMPTZ          NOT NULL DEFAULT now(),

    -- Last line of defence for the template grammar (the full rules - each
    -- token once, no unknown tokens - live in @NamingTemplate): a template
    -- without both tokens would hide every board.
    CONSTRAINT naming_template_has_tokens
        CHECK (naming_template LIKE '%{category}%' AND naming_template LIKE '%{tier}%'),
    CONSTRAINT naming_migrating_from_has_tokens
        CHECK (naming_migrating_from IS NULL
               OR (naming_migrating_from LIKE '%{category}%' AND naming_migrating_from LIKE '%{tier}%')),
    CONSTRAINT naming_tier_labels_valid
        CHECK (tier_label_valid(naming_tier_s) AND tier_label_valid(naming_tier_a) AND tier_label_valid(naming_tier_b)
               AND tier_label_valid(naming_tier_c) AND tier_label_valid(naming_tier_d) AND tier_label_valid(naming_tier_todo)),
    -- tier_label_valid is STRICT: a NULL (not set) passes.
    CONSTRAINT naming_tier_shown_valid
        CHECK (tier_label_valid(naming_tier_s_shown) AND tier_label_valid(naming_tier_a_shown)
               AND tier_label_valid(naming_tier_b_shown) AND tier_label_valid(naming_tier_c_shown)
               AND tier_label_valid(naming_tier_d_shown) AND tier_label_valid(naming_tier_todo_shown)),
    CONSTRAINT naming_tier_labels_distinct
        CHECK (tier_labels_distinct(naming_tier_s, naming_tier_a, naming_tier_b, naming_tier_c, naming_tier_d, naming_tier_todo)),
    CONSTRAINT naming_migration_complete
        CHECK (num_nulls(naming_migrating_from, naming_migrating_from_tier_s, naming_migrating_from_tier_a,
                         naming_migrating_from_tier_b, naming_migrating_from_tier_c, naming_migrating_from_tier_d,
                         naming_migrating_from_tier_todo) IN (0, 7)),
    CONSTRAINT naming_migrating_from_tier_labels_valid
        CHECK (naming_migrating_from IS NULL
               OR (tier_label_valid(naming_migrating_from_tier_s) AND tier_label_valid(naming_migrating_from_tier_a)
                   AND tier_label_valid(naming_migrating_from_tier_b) AND tier_label_valid(naming_migrating_from_tier_c)
                   AND tier_label_valid(naming_migrating_from_tier_d) AND tier_label_valid(naming_migrating_from_tier_todo)
                   AND tier_labels_distinct(naming_migrating_from_tier_s, naming_migrating_from_tier_a,
                                            naming_migrating_from_tier_b, naming_migrating_from_tier_c,
                                            naming_migrating_from_tier_d, naming_migrating_from_tier_todo)))
);

-- Settings -> Playlist naming -> To-do lists: playlists the user explicitly
-- assigned to a board as its to-do list (for names the keyword rule can't
-- place on its own). One row per playlist; part of the settings row, so it
-- shares its version/ETag and goes when the row does.
CREATE TABLE todo_list_link (
    user_id      TEXT         NOT NULL REFERENCES user_settings (user_id) ON DELETE CASCADE,
    playlist_id  VARCHAR(64)  NOT NULL,
    category     VARCHAR(200) NOT NULL,
    PRIMARY KEY (user_id, playlist_id),
    CONSTRAINT playlist_id_format CHECK (playlist_id ~ '^[A-Za-z0-9_-]{1,64}$'),
    CONSTRAINT category_not_blank CHECK (btrim(category) <> '')
);
