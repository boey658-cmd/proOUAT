/**
 * Synchronisation d'une équipe vers les Google Sheets via Apps Script.
 * DOC 1 : { equipe, joueurs } avec joueurs = "Joueur1 (Pseudo1) | Joueur2 (Pseudo2)"
 * DOC 2 : { equipe }
 */

import type { NormalizedTeam, NormalizedPlayer } from '../teams/types.js';
import {
  getGoogleScriptUrl1,
  getGoogleScriptUrl2,
  isGoogleSheetsSyncEnabled,
} from '../../config/index.js';
import { getRequestTimeoutMs } from '../../config/index.js';

const PREFIX = '[googleSheets]';

function log(level: string, message: string, context?: Record<string, unknown>): void {
  const parts = [PREFIX, level, message];
  if (context != null && Object.keys(context).length > 0) {
    parts.push(JSON.stringify(context));
  }
  console.info(parts.join(' '));
}

/**
 * Formate un joueur pour la chaîne "Joueur (Pseudo)".
 * Si discord_username_snapshot est présent : "DiscordName (lol_pseudo)", sinon "lol_pseudo".
 */
function formatPlayerForSheets(p: NormalizedPlayer): string {
  const pseudo = (p.lol_pseudo ?? '').trim() || '?';
  const discordName = (p.discord_username_snapshot ?? '').trim();
  if (discordName) {
    return `${discordName} (${pseudo})`;
  }
  return pseudo;
}

/**
 * Construit la chaîne joueurs attendue par DOC 1 : "Joueur1 (Pseudo1) | Joueur2 (Pseudo2)".
 */
function buildJoueursString(team: NormalizedTeam): string {
  if (!team.players?.length) return '';
  return team.players.map(formatPlayerForSheets).join(' | ');
}

/**
 * Envoie un payload JSON en POST vers une URL Apps Script.
 * Retourne { success, status, body }.
 */
async function postToScript(
  url: string,
  payload: Record<string, string>,
  docLabel: string
): Promise<{ success: boolean; status: number; body: string }> {
  const timeoutMs = getRequestTimeoutMs();
  log('info', `sync Google: envoi vers ${docLabel}`, { url, payload });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const body = await response.text();
    const status = response.status;
    log('info', `sync Google: réponse ${docLabel}`, { status, body: body.slice(0, 500) });

    if (response.ok) {
      log('info', `sync Google: succès ${docLabel}`, { status });
      return { success: true, status, body };
    }
    log('warn', `sync Google: échec ${docLabel}`, { status, body: body.slice(0, 300) });
    return { success: false, status, body };
  } catch (err) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : String(err);
    log('error', `sync Google: erreur ${docLabel}`, { message });
    return { success: false, status: 0, body: message };
  }
}

export interface SyncTeamToGoogleSheetsResult {
  doc1Success: boolean;
  doc2Success: boolean;
  doc1Status?: number;
  doc2Status?: number;
  doc1Body?: string;
  doc2Body?: string;
}

/**
 * Envoie une équipe vers les deux documents Google Sheets (si config activée et URLs définies).
 * DOC 1 : { equipe, joueurs } avec joueurs = "Joueur1 (Pseudo1) | Joueur2 (Pseudo2)"
 * DOC 2 : { equipe }
 *
 * Utilisable comme fonction de test : syncTeamToGoogleSheets(team)
 */
export async function syncTeamToGoogleSheets(
  team: NormalizedTeam
): Promise<SyncTeamToGoogleSheetsResult> {
  const result: SyncTeamToGoogleSheetsResult = {
    doc1Success: false,
    doc2Success: false,
  };

  if (!isGoogleSheetsSyncEnabled()) {
    log('info', 'sync Google: désactivé (ENABLE_GOOGLE_SHEETS_SYNC)', {
      team_api_id: team.team_api_id,
    });
    return result;
  }

  const url1 = getGoogleScriptUrl1();
  const url2 = getGoogleScriptUrl2();

  log('info', 'sync Google: début', {
    team_api_id: team.team_api_id,
    team_name: team.team_name,
    url1: url1 ?? '(non configuré)',
    url2: url2 ?? '(non configuré)',
  });

  const equipe = (team.team_name ?? '').trim() || `Team-${team.team_api_id}`;
  const joueurs = buildJoueursString(team);

  if (url1) {
    const payload1 = { equipe, joueurs };
    log('info', 'sync Google: payload DOC 1', { payload: payload1 });
    const res1 = await postToScript(url1, payload1, 'DOC 1');
    result.doc1Success = res1.success;
    result.doc1Status = res1.status;
    result.doc1Body = res1.body;
  } else {
    log('warn', 'sync Google: DOC 1 ignoré (GOOGLE_SCRIPT_URL_1 non configuré)');
  }

  if (url2) {
    const payload2 = { equipe };
    log('info', 'sync Google: payload DOC 2', { payload: payload2 });
    const res2 = await postToScript(url2, payload2, 'DOC 2');
    result.doc2Success = res2.success;
    result.doc2Status = res2.status;
    result.doc2Body = res2.body;
  } else {
    log('warn', 'sync Google: DOC 2 ignoré (GOOGLE_SCRIPT_URL_2 non configuré)');
  }

  log('info', 'sync Google: fin', {
    team_api_id: team.team_api_id,
    doc1Success: result.doc1Success,
    doc2Success: result.doc2Success,
  });

  return result;
}
