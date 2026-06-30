-- ============================================================
-- MemoVoy — V4: Domínio Social
-- posts, post_media, comments, reactions, saves, reports
-- ============================================================

-- ------------------------------------------------------------
-- POSTS — publicações no feed
-- ------------------------------------------------------------
CREATE TABLE posts (
  id              UUID        PRIMARY KEY DEFAULT generate_ulid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  itinerary_id    UUID        REFERENCES itineraries(id) ON DELETE SET NULL,
  caption         TEXT,
  location_name   VARCHAR(120),
  location_geo    GEOGRAPHY(POINT, 4326),
  country_code    CHAR(2),
  visibility      VARCHAR(20) NOT NULL DEFAULT 'public',
  likes_count     INTEGER     NOT NULL DEFAULT 0,
  comments_count  INTEGER     NOT NULL DEFAULT 0,
  saves_count     INTEGER     NOT NULL DEFAULT 0,
  is_hidden       BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT posts_visibility_chk   CHECK (visibility IN ('public', 'followers', 'private')),
  CONSTRAINT posts_likes_chk        CHECK (likes_count >= 0),
  CONSTRAINT posts_comments_chk     CHECK (comments_count >= 0),
  CONSTRAINT posts_saves_chk        CHECK (saves_count >= 0),
  CONSTRAINT posts_caption_len_chk  CHECK (caption IS NULL OR length(caption) <= 2200)
);

COMMENT ON COLUMN posts.itinerary_id IS 'NULL = post de fotos sem roteiro — outros users não veem o percurso.';
COMMENT ON COLUMN posts.is_hidden    IS 'True após 5+ denúncias em 1h ou decisão de moderador.';

-- ------------------------------------------------------------
-- POST_MEDIA — fotos e vídeos de um post
-- ------------------------------------------------------------
CREATE TABLE post_media (
  id                    UUID        PRIMARY KEY DEFAULT generate_ulid(),
  post_id               UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  position              SMALLINT    NOT NULL,
  media_type            VARCHAR(10) NOT NULL,
  url                   TEXT        NOT NULL,
  thumbnail_url         TEXT,
  width                 SMALLINT,
  height                SMALLINT,
  ai_detected_location  VARCHAR(200),
  moderation_status     VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT post_media_type_chk       CHECK (media_type IN ('image', 'video')),
  CONSTRAINT post_media_position_chk   CHECK (position >= 1),
  CONSTRAINT post_media_status_chk     CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT post_media_dimensions_chk CHECK (
    (width IS NULL AND height IS NULL) OR
    (width > 0 AND height > 0)
  )
);

COMMENT ON COLUMN post_media.url                  IS 'URL no S3/R2 após processamento: EXIF removido, redimensionado.';
COMMENT ON COLUMN post_media.ai_detected_location IS 'Local reconhecido por visão computacional. NULL se não identificado.';
COMMENT ON COLUMN post_media.moderation_status    IS 'Moderação automática (SafeSearch/Rekognition) antes de publicar.';

-- ------------------------------------------------------------
-- COMMENTS — comentários e respostas
-- ------------------------------------------------------------
CREATE TABLE comments (
  id                UUID        PRIMARY KEY DEFAULT generate_ulid(),
  post_id           UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id UUID        REFERENCES comments(id) ON DELETE CASCADE,
  content           TEXT        NOT NULL,
  likes_count       INTEGER     NOT NULL DEFAULT 0,
  is_hidden         BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,

  CONSTRAINT comments_content_len_chk CHECK (length(content) BETWEEN 1 AND 1000),
  CONSTRAINT comments_likes_chk       CHECK (likes_count >= 0)
);

COMMENT ON COLUMN comments.parent_comment_id IS 'NULL = comentário de topo. Máx. 1 nível de aninhamento recomendado na UI.';

-- ------------------------------------------------------------
-- REACTIONS — likes em posts e comentários
-- ------------------------------------------------------------
CREATE TABLE reactions (
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(20) NOT NULL,
  target_id   UUID        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, target_type, target_id),
  CONSTRAINT reactions_target_type_chk CHECK (target_type IN ('post', 'comment'))
);

COMMENT ON TABLE reactions IS 'PK composta garante uma reação por utilizador por alvo.';

-- ------------------------------------------------------------
-- SAVES — roteiros guardados
-- ------------------------------------------------------------
CREATE TABLE saves (
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  itinerary_id  UUID        NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, itinerary_id)
);

-- ------------------------------------------------------------
-- REPORTS — denúncias de conteúdo
-- ------------------------------------------------------------
CREATE TABLE reports (
  id            UUID        PRIMARY KEY DEFAULT generate_ulid(),
  reporter_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type   VARCHAR(20) NOT NULL,
  target_id     UUID        NOT NULL,
  category      VARCHAR(40) NOT NULL,
  note          TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  resolution    VARCHAR(20),
  moderator_id  UUID        REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ,

  CONSTRAINT reports_target_type_chk  CHECK (target_type IN ('post', 'comment', 'profile')),
  CONSTRAINT reports_category_chk     CHECK (category IN ('inappropriate', 'spam', 'misinformation', 'privacy', 'hate', 'other')),
  CONSTRAINT reports_status_chk       CHECK (status IN ('pending', 'resolved', 'dismissed')),
  CONSTRAINT reports_resolution_chk   CHECK (resolution IS NULL OR resolution IN ('removed', 'restored', 'warned', 'banned')),
  CONSTRAINT reports_note_len_chk     CHECK (note IS NULL OR length(note) <= 500),
  -- Um utilizador não pode denunciar o mesmo conteúdo duas vezes
  CONSTRAINT reports_unique_per_user  UNIQUE (reporter_id, target_id, target_type)
);

-- ============================================================
-- ÍNDICES — Domínio Social
-- ============================================================

-- Feed: posts de um utilizador, mais recentes primeiro
CREATE INDEX idx_posts_user_created
  ON posts(user_id, created_at DESC)
  WHERE deleted_at IS NULL AND is_hidden = false;

-- Top países do mês (posts públicos por país)
CREATE INDEX idx_posts_country_created
  ON posts(country_code, created_at DESC)
  WHERE deleted_at IS NULL AND visibility = 'public';

-- Pesquisa geo de posts
CREATE INDEX idx_posts_geo
  ON posts USING GIST(location_geo)
  WHERE deleted_at IS NULL AND visibility = 'public';

-- Media de um post
CREATE INDEX idx_post_media_post
  ON post_media(post_id, position);

-- Comentários de um post (mais recentes primeiro)
CREATE INDEX idx_comments_post
  ON comments(post_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Fila de moderação (pendentes primeiro)
CREATE INDEX idx_reports_pending
  ON reports(status, created_at)
  WHERE status = 'pending';

-- ============================================================
-- TRIGGERS — Contadores de likes, comments, saves
-- ============================================================

-- Trigger: reactions → posts.likes_count e comments.likes_count
CREATE OR REPLACE FUNCTION fn_update_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.target_type = 'post' THEN
      UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.target_id;
    ELSIF NEW.target_type = 'comment' THEN
      UPDATE comments SET likes_count = likes_count + 1 WHERE id = NEW.target_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.target_type = 'post' THEN
      UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.target_id;
    ELSIF OLD.target_type = 'comment' THEN
      UPDATE comments SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.target_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_likes_count
  AFTER INSERT OR DELETE ON reactions
  FOR EACH ROW EXECUTE FUNCTION fn_update_likes_count();

-- Trigger: comments → posts.comments_count
CREATE OR REPLACE FUNCTION fn_update_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.deleted_at IS NULL THEN
    UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    -- Soft delete de comentário
    UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = NEW.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comments_count
  AFTER INSERT OR UPDATE OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION fn_update_comments_count();

-- Trigger: saves → itineraries.saves_count
CREATE OR REPLACE FUNCTION fn_update_saves_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE itineraries SET saves_count = saves_count + 1 WHERE id = NEW.itinerary_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE itineraries SET saves_count = GREATEST(saves_count - 1, 0) WHERE id = OLD.itinerary_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_saves_count
  AFTER INSERT OR DELETE ON saves
  FOR EACH ROW EXECUTE FUNCTION fn_update_saves_count();

-- Trigger: auto-ocultar post com 5+ denúncias em 1h
CREATE OR REPLACE FUNCTION fn_auto_hide_reported_content()
RETURNS TRIGGER AS $$
DECLARE
  report_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO report_count
  FROM reports
  WHERE target_id = NEW.target_id
    AND target_type = NEW.target_type
    AND status = 'pending'
    AND created_at > NOW() - INTERVAL '1 hour';

  IF report_count >= 5 AND NEW.target_type = 'post' THEN
    UPDATE posts SET is_hidden = true WHERE id = NEW.target_id;
  ELSIF report_count >= 5 AND NEW.target_type = 'comment' THEN
    UPDATE comments SET is_hidden = true WHERE id = NEW.target_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_hide_reported
  AFTER INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION fn_auto_hide_reported_content();
