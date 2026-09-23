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
    -- The word that marks a playlist as a board's to-do list, wherever it
    -- appears in the name ("[G] Rap TODO", "TODO - Rap"), any case.
    naming_todo_keyword    VARCHAR(20)          NOT NULL,
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
        CHECK (naming_migrating_from IS DISTINCT FROM naming_template),
    -- Mirrors @TodoKeyword / todoLists.js validateTodoKeyword: words of
    -- letters/digits, and never a tier code (that would read as a tier).
    CONSTRAINT naming_todo_keyword_format
        CHECK (naming_todo_keyword ~ '^[[:alnum:]]+( [[:alnum:]]+)*$'
               AND upper(naming_todo_keyword) NOT IN ('T1', 'T2', 'T3', 'TE', 'TZ'))
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

-- Inbox: liked videos the user marked "not a song", so they stop showing up
-- among the likes waiting to be filed into a tier. Undo deletes the row.
CREATE TABLE inbox_dismissal (
    user_id       TEXT        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    video_id      VARCHAR(11) NOT NULL,
    dismissed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, video_id),
    -- YouTube video ids are exactly 11 URL-safe base64 characters.
    CONSTRAINT video_id_format CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$')
);
