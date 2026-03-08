-- Index sur teams(status) pour les requêtes par statut (ex. détection removed).
CREATE INDEX IF NOT EXISTS idx_teams_status ON teams(status);
