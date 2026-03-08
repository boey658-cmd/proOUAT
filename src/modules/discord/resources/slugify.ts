/**
 * Slug pour noms de salon et rôles Discord (caractères autorisés, longueur limitée).
 */

const MAX_CHANNEL_NAME_LENGTH = 100;
const MAX_ROLE_NAME_LENGTH = 100;

/**
 * Produit un slug sûr pour un nom de salon Discord (minuscules, chiffres, tirets).
 */
export function slugifyChannelName(name: string, maxLength = MAX_CHANNEL_NAME_LENGTH): string {
  if (typeof name !== 'string') return 'equipe';
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const base = slug || 'equipe';
  return base.slice(0, maxLength);
}

/**
 * Produit un nom sûr pour un rôle (même règles, longueur rôle).
 */
export function slugifyRoleName(name: string, maxLength = MAX_ROLE_NAME_LENGTH): string {
  return slugifyChannelName(name, maxLength);
}
