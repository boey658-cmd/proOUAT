/**
 * Règle alignée sur le backend (`isValidDiscordSnowflake`) :
 * snowflake Discord = chaîne numérique 17–20 caractères.
 * Toute autre valeur (vide, "Tous", texte, etc.) → ne pas l’envoyer à l’API.
 */
const DISCORD_SNOWFLAKE_RE = /^\d{17,20}$/;

const SENTINEL_LOWER = new Set(['all', 'tous', '']);

/**
 * Retourne un guild ID utilisable dans query ou JSON, ou `undefined` pour omettre la clé.
 * Ne renvoie jamais null ici : l’appelant utilise explicitement `null` seulement s’il veut effacer côté API.
 */
export function normalizeTargetGuildIdForApi(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  if (SENTINEL_LOWER.has(t.toLowerCase())) return undefined;
  if (!DISCORD_SNOWFLAKE_RE.test(t)) return undefined;
  return t;
}
