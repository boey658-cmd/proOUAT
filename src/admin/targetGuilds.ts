/**
 * Serveurs Discord autorisés comme cible d’affectation (même périmètre que le bot).
 * Labels pour l’UI : variables d’environnement optionnelles.
 */

import { getDiscordGuildId1, getDiscordGuildId2 } from '../config/discord.js';

export interface TargetGuildOption {
  id: string;
  label: string;
}

function getEnv(key: string): string | undefined {
  const v = process.env[key];
  if (v == null || typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

/** Options pour selects admin (ordre : guilde 1, guilde 2). */
export function getTargetGuildOptions(): TargetGuildOption[] {
  const g1 = getDiscordGuildId1();
  const g2 = getDiscordGuildId2();
  const out: TargetGuildOption[] = [];
  if (g1) {
    out.push({
      id: g1,
      label: getEnv('DISCORD_GUILD_1_LABEL') ?? 'Discord 1',
    });
  }
  if (g2) {
    out.push({
      id: g2,
      label: getEnv('DISCORD_GUILD_2_LABEL') ?? 'Discord 2',
    });
  }
  return out;
}

export function isAllowedAdminTargetGuildId(guildId: string): boolean {
  const g1 = getDiscordGuildId1();
  const g2 = getDiscordGuildId2();
  if (!g1 && !g2) return true;
  return guildId === g1 || guildId === g2;
}

export function getTargetGuildLabel(guildId: string | null | undefined): string {
  if (!guildId?.trim()) return '—';
  const id = guildId.trim();
  const opt = getTargetGuildOptions().find((o) => o.id === id);
  return opt ? `${opt.label} (${id})` : id;
}
