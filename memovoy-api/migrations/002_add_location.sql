-- G7: adicionar campo location ao perfil de utilizador
ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(100);
