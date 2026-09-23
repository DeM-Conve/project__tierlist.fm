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

-- One row per user: their app settings. No row = the account has never saved.
CREATE TABLE user_settings (
    user_id                TEXT                 PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    -- Settings -> Appearance
    theme                  theme_option         NOT NULL,
    accent                 accent_option        NOT NULL,
    tier_palette           tier_palette_option  NOT NULL,
    -- Settings -> Playlist naming. migrating_from is the previous template
    -- while a rename job is unfinished (titles matching either stay visible).
    naming_template        VARCHAR(200)         NOT NULL,
    naming_migrating_from  VARCHAR(200),
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
    CONSTRAINT naming_migrating_from_differs
        CHECK (naming_migrating_from IS DISTINCT FROM naming_template)
);
