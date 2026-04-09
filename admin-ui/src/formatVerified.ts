/** Texte lisible pour la fraîcheur du dernier scan (fuseau local). */

export function formatLastVerifiedLine(iso: string | null): string {
  if (!iso?.trim()) return 'Jamais vérifié';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Date de vérification invalide';

  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  if (sameDay) {
    return `Vérifié à ${time}`;
  }

  const datePart = d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return `Vérifié le ${datePart} à ${time}`;
}
