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
-- "vivid") - see the enums in fm.tierlist.settings.
-- New option = `ALTER TYPE ... ADD VALUE` in a new migration + Java constant
-- + frontend catalogue entry.
CREATE TYPE theme_option         AS ENUM ('TOKYO', 'DRACULA', 'CHARCOAL', 'PAPER', 'SAND', 'SOLARIZED');
CREATE TYPE accent_option        AS ENUM ('BLUE', 'VIOLET', 'TEAL', 'GREEN', 'PINK', 'RED', 'ORANGE', 'AMBER');
CREATE TYPE tier_palette_option  AS ENUM ('VIVID', 'CLASSIC', 'HEAT');

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

-- ---------------------------------------------------------------- Duels
-- The duel log is the source of truth: the duel engine (fm.tierlist.duel.engine)
-- rebuilds every score, tier probability and suggestion from it, the starting
-- scores and the user's decisions. A board is identified by its name (the
-- {category} in its playlists' titles); a video by its YouTube id.

CREATE TYPE duel_verdict    AS ENUM ('A_CLEARLY', 'A', 'TOO_CLOSE', 'B', 'B_CLEARLY');
CREATE TYPE duel_focus      AS ENUM ('SMART_MIX', 'PLACE_TODO', 'BORDERLINES', 'ONE_SONG');
CREATE TYPE tier_slot       AS ENUM ('S', 'A', 'B', 'C', 'D', 'TODO');
CREATE TYPE move_decision   AS ENUM ('ACCEPTED', 'KEPT');

CREATE FUNCTION video_id_valid(id TEXT) RETURNS BOOLEAN
    LANGUAGE sql IMMUTABLE STRICT
    RETURN id ~ '^[A-Za-z0-9_-]{11}$';

-- One sitting of duels on a board.
CREATE TABLE duel_session (
    id               UUID         PRIMARY KEY,
    user_id          TEXT         NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    board            VARCHAR(200) NOT NULL,
    focus            duel_focus   NOT NULL,
    -- The pinned song (ONE_SONG only).
    song_id          VARCHAR(11),
    minutes          SMALLINT     NOT NULL,
    started_at       TIMESTAMPTZ  NOT NULL,
    ended_at         TIMESTAMPTZ,
    -- Board certainty when it started, for the session summary.
    certainty_start  REAL         NOT NULL,
    CONSTRAINT session_board_not_blank CHECK (btrim(board) <> ''),
    CONSTRAINT session_minutes_range   CHECK (minutes BETWEEN 1 AND 60),
    CONSTRAINT session_certainty_range CHECK (certainty_start BETWEEN 0 AND 1),
    CONSTRAINT session_song_for_one_song CHECK ((focus = 'ONE_SONG') = (song_id IS NOT NULL)),
    CONSTRAINT session_song_valid      CHECK (video_id_valid(song_id)),
    CONSTRAINT session_ends_after_start CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX duel_session_board ON duel_session (user_id, board, started_at);

-- One verdict. `verdict` is from video_a's side.
CREATE TABLE duel (
    id          BIGSERIAL    PRIMARY KEY,
    session_id  UUID         NOT NULL REFERENCES duel_session (id) ON DELETE CASCADE,
    video_a     VARCHAR(11)  NOT NULL,
    video_b     VARCHAR(11)  NOT NULL,
    verdict     duel_verdict NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL,
    CONSTRAINT duel_two_songs   CHECK (video_a <> video_b),
    CONSTRAINT duel_videos_valid CHECK (video_id_valid(video_a) AND video_id_valid(video_b))
);
CREATE INDEX duel_by_session ON duel (session_id, created_at);

-- "Don't know one of them": the song isn't offered again in that session.
CREATE TABLE duel_skip (
    session_id  UUID        NOT NULL REFERENCES duel_session (id) ON DELETE CASCADE,
    video_id    VARCHAR(11) NOT NULL,
    PRIMARY KEY (session_id, video_id),
    CONSTRAINT skip_video_valid CHECK (video_id_valid(video_id))
);

-- The score a song starts from, made from the tier it was in (`tier`), so a
-- replay of the log always starts from the same place. Remade when the song's
-- tier changes - a move the user made (by hand or by accepting a suggestion)
-- is their call, and the duels still count on top of it.
CREATE TABLE duel_prior (
    user_id     TEXT             NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    board       VARCHAR(200)     NOT NULL,
    video_id    VARCHAR(11)      NOT NULL,
    tier        tier_slot        NOT NULL,
    mu          DOUBLE PRECISION NOT NULL,
    sigma       DOUBLE PRECISION NOT NULL,
    created_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, board, video_id),
    CONSTRAINT prior_sigma_positive CHECK (sigma > 0),
    CONSTRAINT prior_video_valid    CHECK (video_id_valid(video_id))
);

-- The user's answer to a suggested move (pending suggestions are derived,
-- never stored). One per song: a newer answer replaces the old one.
CREATE TABLE duel_decision (
    user_id            TEXT          NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    board              VARCHAR(200)  NOT NULL,
    video_id           VARCHAR(11)   NOT NULL,
    from_tier          tier_slot     NOT NULL,
    to_tier            tier_slot     NOT NULL,
    confidence         REAL          NOT NULL,
    decision           move_decision NOT NULL,
    -- How many duels the song had then - Keep counts fresh duels from here.
    duels_at_decision  INTEGER       NOT NULL,
    decided_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, board, video_id),
    CONSTRAINT decision_moves          CHECK (from_tier <> to_tier),
    CONSTRAINT decision_to_ranked      CHECK (to_tier <> 'TODO'),
    CONSTRAINT decision_confidence     CHECK (confidence BETWEEN 0 AND 1),
    CONSTRAINT decision_duels_positive CHECK (duels_at_decision >= 0),
    CONSTRAINT decision_video_valid    CHECK (video_id_valid(video_id))
);

-- Songs locked in their tier: never suggested to move.
CREATE TABLE duel_lock (
    user_id    TEXT         NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    board      VARCHAR(200) NOT NULL,
    video_id   VARCHAR(11)  NOT NULL,
    locked_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, board, video_id),
    CONSTRAINT lock_video_valid CHECK (video_id_valid(video_id))
);
