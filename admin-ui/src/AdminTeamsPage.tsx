import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AdminTeamRow, DiscordPickOption, StatusFilter } from './types';
import {
  fetchGuildResources,
  fetchTeams,
  patchTeam,
  verifyAllTeams,
  verifyOneTeam,
} from './api';
import { rowBackgroundForStatus, statusBadgeStyle } from './statusStyle';
import { formatLastVerifiedLine } from './formatVerified';

type EditingState = {
  roleId: string;
  channelId: string;
};

function formatDiscordPickLabel(opt: { id: string; name: string }): string {
  return `${opt.name} — ${opt.id}`;
}

function countByStatus(rows: AdminTeamRow[]): Record<StatusFilter, number> {
  const c = {
    all: rows.length,
    ok: 0,
    warning: 0,
    error: 0,
    unknown: 0,
  };
  for (const r of rows) {
    const lv = r.verification.level;
    if (lv === 'ok') c.ok += 1;
    else if (lv === 'warning') c.warning += 1;
    else if (lv === 'error') c.error += 1;
    else c.unknown += 1;
  }
  return c;
}

/** Page principale : tableau des équipes, édition par ligne, vérification Discord explicite. */
export function AdminTeamsPage() {
  const [rows, setRows] = useState<AdminTeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditingState | null>(null);
  const [guildResources, setGuildResources] = useState<{
    roles: DiscordPickOption[];
    channels: DiscordPickOption[];
  } | null>(null);
  const [busyVerifyAll, setBusyVerifyAll] = useState(false);
  const [rowAction, setRowAction] = useState<{ teamId: number; kind: 'save' | 'verify' } | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');

  const tokenOk = useMemo(
    () => Boolean((import.meta.env.VITE_ADMIN_API_TOKEN ?? '').trim()),
    []
  );

  const counts = useMemo(() => countByStatus(rows), [rows]);
  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.verification.level === filter);
  }, [rows, filter]);

  /** Bloque toute autre action (autre ligne ou en-tête) pour éviter courses / doubles clics. */
  const globalBusy = busyVerifyAll || rowAction !== null;

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const teams = await fetchTeams();
      setRows(teams);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = async (row: AdminTeamRow) => {
    setError(null);
    if (!row.guild_id) {
      setError('Guilde non définie : impossible de charger les listes rôle / salon.');
      return;
    }
    if (globalBusy) return;
    setEditingId(row.id);
    setDraft({
      roleId: row.role_id ?? '',
      channelId: row.private_channel_id ?? '',
    });
    try {
      const res = await fetchGuildResources(row.guild_id);
      const roles = [...res.roles];
      if (row.role_id && !roles.some((r) => r.id === row.role_id)) {
        roles.unshift({ id: row.role_id, name: '⚠ introuvable sur Discord' });
      }
      const channels = [...res.channels];
      if (row.private_channel_id && !channels.some((c) => c.id === row.private_channel_id)) {
        channels.unshift({ id: row.private_channel_id, name: '⚠ introuvable sur Discord' });
      }
      setGuildResources({ roles, channels });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuildResources(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
    setGuildResources(null);
  };

  const saveRow = async (teamId: number) => {
    if (!draft) return;
    setError(null);
    setRowAction({ teamId, kind: 'save' });
    try {
      const updated = await patchTeam(teamId, {
        role_id: draft.roleId.trim() === '' ? null : draft.roleId.trim(),
        private_channel_id: draft.channelId.trim() === '' ? null : draft.channelId.trim(),
      });
      setRows((prev) => prev.map((r) => (r.id === teamId ? updated : r)));
      cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRowAction(null);
    }
  };

  const onVerifyAll = async () => {
    setError(null);
    setBusyVerifyAll(true);
    try {
      const teams = await verifyAllTeams();
      setRows(teams);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyVerifyAll(false);
    }
  };

  const onVerifyRow = async (teamId: number) => {
    setError(null);
    setRowAction({ teamId, kind: 'verify' });
    try {
      const one = await verifyOneTeam(teamId);
      setRows((prev) => prev.map((r) => (r.id === teamId ? one : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRowAction(null);
    }
  };

  const filterBtnStyle = (active: boolean): CSSProperties => ({
    opacity: active ? 1 : 0.75,
    borderColor: active ? '#60a5fa' : '#475569',
    background: active ? '#1e3a5f' : '#1e293b',
  });

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <header style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Équipes — administration</h1>
        <button
          type="button"
          className="primary"
          onClick={() => void load()}
          disabled={loading || globalBusy || editingId !== null}
        >
          Actualiser
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => void onVerifyAll()}
          disabled={loading || busyVerifyAll || globalBusy || editingId !== null}
        >
          {busyVerifyAll ? 'Vérification…' : 'Vérifier tout'}
        </button>
      </header>

      {!tokenOk && (
        <p className="err" style={{ marginTop: 0 }}>
          Définir <code>VITE_ADMIN_API_TOKEN</code> dans <code>admin-ui/.env</code> (identique à{' '}
          <code>ADMIN_API_TOKEN</code> du bot).
        </p>
      )}

      {error && <p className="err">{error}</p>}
      {loading && <p className="muted">Chargement…</p>}

      {!loading && rows.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {(
            [
              ['all', `Tous (${counts.all})`],
              ['ok', `OK (${counts.ok})`],
              ['warning', `Warnings (${counts.warning})`],
              ['error', `Errors (${counts.error})`],
              ['unknown', `Unknown (${counts.unknown})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              style={filterBtnStyle(filter === key)}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!loading && !error && rows.length === 0 && <p className="muted">Aucune équipe en base.</p>}

      {!loading && rows.length > 0 && filteredRows.length === 0 && (
        <p className="muted">Aucune équipe pour ce filtre.</p>
      )}

      {!loading && filteredRows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Équipe</th>
                <th>Guilde</th>
                <th>Rôle équipe</th>
                <th>Salon privé</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isEditing = editingId === row.id;
                const rowBusy =
                  rowAction !== null && rowAction.teamId === row.id && rowAction.kind === 'save';
                const rowVerifying =
                  rowAction !== null && rowAction.teamId === row.id && rowAction.kind === 'verify';
                const otherRowBusy = rowAction !== null && rowAction.teamId !== row.id;
                const bg = rowBackgroundForStatus(row.verification.level);

                const disableModify =
                  busyVerifyAll || otherRowBusy || (editingId !== null && editingId !== row.id);
                const disableVerify =
                  busyVerifyAll || busyRow !== null || editingId !== null;

                return (
                  <tr key={row.id} style={{ background: bg }}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.team_name}</div>
                      <div className="muted">
                        id {row.id} · API {row.team_api_id} · {row.team_status}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{row.guild_label}</div>
                    </td>
                    <td>
                      {isEditing && draft && guildResources ? (
                        <select
                          value={draft.roleId}
                          onChange={(e) => setDraft({ ...draft, roleId: e.target.value })}
                        >
                          <option value="">— Aucun —</option>
                          {guildResources.roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {formatDiscordPickLabel(r)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div>
                          {row.role_name ?? <span className="muted">(sans nom)</span>}
                          <div className="muted">{row.role_id ?? '—'}</div>
                        </div>
                      )}
                    </td>
                    <td>
                      {isEditing && draft && guildResources ? (
                        <select
                          value={draft.channelId}
                          onChange={(e) => setDraft({ ...draft, channelId: e.target.value })}
                        >
                          <option value="">— Aucun —</option>
                          {guildResources.channels.map((c) => (
                            <option key={c.id} value={c.id}>
                              {formatDiscordPickLabel(c)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div>
                          {row.channel_name ?? <span className="muted">(sans nom)</span>}
                          <div className="muted">{row.private_channel_id ?? '—'}</div>
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={statusBadgeStyle(row.verification.level)}>{row.verification.level}</span>
                      <div style={{ marginTop: 6, fontSize: 13 }}>{row.verification.label}</div>
                      <div className="muted" style={{ marginTop: 6 }}>
                        {formatLastVerifiedLine(row.last_verified_at)}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                        {!isEditing && (
                          <>
                            <button
                              type="button"
                              onClick={() => void startEdit(row)}
                              disabled={disableModify}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => void onVerifyRow(row.id)}
                              disabled={disableVerify}
                            >
                              {rowVerifying ? 'Vérification…' : 'Vérifier'}
                            </button>
                          </>
                        )}
                        {isEditing && (
                          <>
                            <button
                              type="button"
                              className="primary"
                              onClick={() => void saveRow(row.id)}
                              disabled={rowBusy || !draft}
                            >
                              {rowBusy ? 'Enregistrement…' : 'Enregistrer'}
                            </button>
                            <button type="button" onClick={cancelEdit} disabled={rowBusy}>
                              Annuler
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
