-- A signed-in Google account. `id` is Google's stable subject id (the
-- OpenID `sub` claim), so it never changes even if the name/email does.
CREATE TABLE app_user (
    id             TEXT        PRIMARY KEY,
    display_name   TEXT,
    picture_url    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per user: their app settings. Values are keys into catalogues the
-- frontend owns (themes.js, naming.js, duel/), validated by the backend's
-- SettingsDto. No row yet = the account has never saved settings.
CREATE TABLE user_settings (
    user_id                TEXT        PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    -- Settings -> Appearance
    theme                  VARCHAR(40)  NOT NULL,
    accent                 VARCHAR(40)  NOT NULL,
    tier_palette           VARCHAR(40)  NOT NULL,
    -- Settings -> Playlist naming. migrating_from is set while a rename job
    -- is unfinished (titles matching either template stay visible).
    naming_template        VARCHAR(200) NOT NULL,
    naming_migrating_from  VARCHAR(200),
    -- Settings -> Duels
    duel_strategy          VARCHAR(40)  NOT NULL,
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now()
);
