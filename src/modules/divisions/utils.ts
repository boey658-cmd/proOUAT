/**
 * Utilitaires de nommage pour les divisions (rôles, salons, catégories).
 * Une responsabilité : formater les noms selon le standard "1A - Team Alpha" / "1A-team-slug".
 */

const MAX_CHANNEL_NAME_LENGTH = 100;
const MAX_ROLE_NAME_LENGTH = 100;

/**
 * Convertit un numéro de groupe (1-4) en lettre (A-D).
 */
export function groupNumberToLetter(group: number): string {
  switch (group) {
    case 1: return 'A';
    case 2: return 'B';
    case 3: return 'C';
    case 4: return 'D';
    default: return String(group);
  }
}

/**
 * Convertit un libellé de groupe (DB ou API) en lettre pour affichage/nommage.
 * "1" / "A" → A, "2" / "B" → B, etc.
 */
export function groupLabelToLetter(label: string): string {
  const s = String(label).trim().toUpperCase();
  if (s === '1' || s === 'A') return 'A';
  if (s === '2' || s === 'B') return 'B';
  if (s === '3' || s === 'C') return 'C';
  if (s === '4' || s === 'D') return 'D';
  return s || '?';
}

/**
 * Clé de tri pour ordonner les groupes (A avant B avant C avant D).
 */
export function groupLabelToSortKey(label: string): number {
  const s = String(label).trim().toUpperCase();
  if (s === '1' || s === 'A') return 1;
  if (s === '2' || s === 'B') return 2;
  if (s === '3' || s === 'C') return 3;
  if (s === '4' || s === 'D') return 4;
  return 99;
}

/**
 * Produit un slug sûr pour un nom de salon (minuscules, chiffres, tirets).
 */
function slugifyChannelSegment(name: string, maxLength: number): string {
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
 * Nom du rôle avec préfixe division + lettre groupe : "1A - Team Alpha".
 */
export function formatDivisionRoleName(
  divisionNumber: number,
  divisionGroup: string,
  teamName: string
): string {
  const groupLetter = groupLabelToLetter(divisionGroup);
  const prefix = `${divisionNumber}${groupLetter} - `;
  const name = String(teamName).trim() || 'Équipe';
  const full = prefix + name;
  return full.slice(0, MAX_ROLE_NAME_LENGTH);
}

/**
 * Nom du salon avec préfixe division + lettre groupe : "1A-hsd-atlas" (format Discord).
 */
export function formatDivisionChannelName(
  divisionNumber: number,
  divisionGroup: string,
  teamName: string
): string {
  const groupLetter = groupLabelToLetter(divisionGroup);
  const prefix = `${divisionNumber}${groupLetter}-`;
  const slug = slugifyChannelSegment(teamName, MAX_CHANNEL_NAME_LENGTH - prefix.length);
  const full = prefix + slug;
  return full.slice(0, MAX_CHANNEL_NAME_LENGTH);
}

/**
 * Nom de la catégorie Discord pour une division : "Division 1" (une catégorie par division).
 */
export function getDivisionCategoryName(divisionNumber: number, _divisionGroup?: string): string {
  return `Division ${divisionNumber}`;
}
