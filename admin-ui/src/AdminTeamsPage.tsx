import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AdminTargetGuildsMetaResponse, AdminTeamRow, DiscordPickOption, StatusFilter } from './types';
import {
  fetchGuildResources,
  fetchTargetGuildsMeta,
  fetchTeams,
  patchTeam,
  verifyAllTeams,
  verifyOneTeam,
} from './api';
import { rowBackgroundForStatus, statusBadgeStyle } from './statusStyle';
import { formatLastVerifiedLine } from './formatVerified';

type EditingState = {
  targetGuildId: string;
  divisionStr: string;
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

function divisionOptions(min: number, max: number): number[] {
  const o: number[] = [];
  for (let i = min; i <= max; i += 1) o.push(i);
  return o;
}

/** Page principale : affectation serveur / division + édition rôle/salon + vérifs limitées au scope. */
export function AdminTeamsPage() {
  const [meta, setMeta] = useState<AdminTargetGuildsMetaResponse | null>(null);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [divisionScope, setDivisionScope] = useState<number | 'all'>('all');

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const tokenOk = useMemo(
    () => Boolean((import.meta.env.VITE_ADMIN_API_TOKEN ?? '').trim()),
    []
  );

  const globalBusy = busyVerifyAll || rowAction !== null;

  useEffect(() => {
    void (async () => {
      try {
        const m = await fetchTargetGuildsMeta();
        setMeta(m);
        if (m.guilds.length > 0) {
          setSelectedServerId((cur) => (cur === '' ? m.guilds[0]!.id : cur));
        }
      } catch (e) {
        setMetaErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setError(null);
    if (!selectedServerId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const teams = await fetchTeams({
        targetGuildId: selectedServerId,
        targetDivisionNumber: divisionScope === 'all' ? undefined : divisionScope,
      });
      setRows(teams);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedServerId, divisionScope]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => countByStatus(rows), [rows]);
  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return rows;
    return rows.filter((r) => r.verification.level === statusFilter);
  }, [rows, statusFilter]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const da = a.target_division_number ?? 9999;
      const db = b.target_division_number ?? 9999;
      if (da !== db) return da - db;
      return a.team_name.localeCompare(b.team_name, 'fr');
    });
  }, [filteredRows]);

  const startEdit = async (row: AdminTeamRow) => {
    setError(null);
    const gid = row.target_guild_id ?? selectedServerId;
    if (!gid) {
      setError('Assignez un serveur cible à cette équipe (ou sélectionnez un serveur en haut de page).');
      return;
    }
    if (globalBusy) return;
    setEditingId(row.id);
    setDraft({
      targetGuildId: row.target_guild_id ?? selectedServerId,
      divisionStr: row.target_division_number != null ? String(row.target_division_number) : '',
      roleId: row.role_id ?? '',
      channelId: row.private_channel_id ?? '',
    });
    try {
      const res = await fetchGuildResources(gid);
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

  /** Quand on change le serveur cible dans le formulaire, recharger les listes rôles/salons. */
  const reloadResourcesForGuild = async (guildId: string, row: AdminTeamRow) => {
    if (!guildId.trim()) {
      setGuildResources(null);
      return;
    }
    try {
      const res = await fetchGuildResources(guildId.trim());
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

  const saveRow = async (teamId: number, row: AdminTeamRow) => {
    if (!draft || !meta) return;
    setError(null);

    const tDiv = draft.divisionStr.trim();
    let target_division_number: number | null | undefined = undefined;
    if (tDiv === '') {
      target_division_number = null;
    } else {
      const n = Number.parseInt(tDiv, 10);
      if (!Number.isFinite(n) || n < meta.division_min || n > meta.division_max) {
        setError(`Division : entier entre ${meta.division_min} et ${meta.division_max}, ou laisser vide`);
        return;
      }
      target_division_number = n;
    }

    const tid = draft.targetGuildId.trim();
    if (!tid) {
      setError('Serveur cible obligatoire pour enregistrer.');
      return;
    }

    setRowAction({ teamId, kind: 'save' });
    try {
      const updated = await patchTeam(teamId, {
        target_guild_id: tid,
        target_division_number,
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
    if (!selectedServerId) return;
    setError(null);
    setBusyVerifyAll(true);
    try {
      const teams = await verifyAllTeams({
        targetGuildId: selectedServerId,
        targetDivisionNumber: divisionScope === 'all' ? undefined : divisionScope,
      });
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

  const divMin = meta?.division_min ?? 1;
  const divMax = meta?.division_max ?? 12;

  return (
    <div style={{ padding: 24, maxWidth: 1480, margin: '0 auto' }}>
      <header style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, width: '100%' }}>Équipes — administration</h1>
      </header>

      {metaErr && <p className="err">{metaErr}</p>}
      {meta && meta.guilds.length === 0 && (
        <p className="err">
          Aucun serveur cible : définissez <code>DISCORD_GUILD_ID_1</code> / <code>DISCORD_GUILD_ID_2</code> côté
          bot.
        </p>
      )}

      <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Serveur actif
          <select
            value={selectedServerId}
            onChange={(e) => setSelectedServerId(e.target.value)}
            disabled={globalBusy || !meta || meta.guilds.length === 0}
          >
            {meta?.guilds.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Division (liste)
          <select
            value={divisionScope === 'all' ? 'all' : String(divisionScope)}
            onChange={(e) => {
              const v = e.target.value;
              setDivisionScope(v === 'all' ? 'all' : Number.parseInt(v, 10));
            }}
            disabled={globalBusy || !selectedServerId}
          >
            <option value="all">Toutes</option>
            {divisionOptions(divMin, divMax).map((n) => (
              <option key={n} value={n}>
                Div {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="primary"
          onClick={() => void load()}
          disabled={loading || globalBusy || editingId !== null || !selectedServerId}
        >
          Actualiser
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => void onVerifyAll()}
          disabled={
            loading || busyVerifyAll || globalBusy || editingId !== null || !selectedServerId
          }
        >
          {busyVerifyAll ? 'Vérification…' : 'Vérifier tout (scope actif)'}
        </button>
      </div>

      {!tokenOk && (
        <p className="err" style={{ marginTop: 0 }}>
          Définir <code>VITE_ADMIN_API_TOKEN</code> dans <code>admin-ui/.env</code> (identique à{' '}
          <code>ADMIN_API_TOKEN</code> du bot).
        </p>
      )}

      {error && <p className="err">{error}</p>}
      {loading && <p className="muted">Chargement…</p>}

      {!loading && selectedServerId && rows.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {(
            [
              ['all', `Statut : Tous (${counts.all})`],
              ['ok', `OK (${counts.ok})`],
              ['warning', `Warnings (${counts.warning})`],
              ['error', `Errors (${counts.error})`],
              ['unknown', `Unknown (${counts.unknown})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              style={filterBtnStyle(statusFilter === key)}
              onClick={() => setStatusFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!loading && !error && selectedServerId && rows.length === 0 && (
        <p className="muted">Aucune équipe pour ce serveur (et cette division si filtrée).</p>
      )}

      {!loading && sortedRows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Équipe</th>
                <th>Serveur cible</th>
                <th>Division</th>
                <th>Rôle équipe</th>
                <th>Salon privé</th>
                <th>Statut</th>
                <th>Dernière vérif.</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const isEditing = editingId === row.id;
                const rowBusy =
                  rowAction !== null && rowAction.teamId === row.id && rowAction.kind === 'save';
                const rowVerifying =
                  rowAction !== null && rowAction.teamId === row.id && rowAction.kind === 'verify';
                const bg = rowBackgroundForStatus(row.verification.level);
                const disableModify =
                  globalBusy || (editingId !== null && editingId !== row.id);
                const disableVerify = globalBusy || editingId !== null;

                return (
                  <tr key={row.id} style={{ background: bg }}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.team_name}</div>
                      <div className="muted">
                        id {row.id} · API {row.team_api_id} · {row.team_status}
                      </div>
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {isEditing && draft && meta ? (
                        <select
                          value={draft.targetGuildId}
                          onChange={async (e) => {
                            const v = e.target.value;
                            setDraft({ ...draft, targetGuildId: v });
                            await reloadResourcesForGuild(v, row);
                          }}
                        >
                          {meta.guilds.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div>{row.target_guild_label}</div>
                      )}
                    </td>
                    <td>
                      {isEditing && draft && meta ? (
                        <select
                          value={draft.divisionStr === '' ? '' : draft.divisionStr}
                          onChange={(e) => setDraft({ ...draft, divisionStr: e.target.value })}
                        >
                          <option value="">—</option>
                          {divisionOptions(meta.division_min, meta.division_max).map((n) => (
                            <option key={n} value={String(n)}>
                              {n}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>{row.target_division_number ?? '—'}</span>
                      )}
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
                      <span style={statusBadgeStyle(row.verification.level)}>
                        {row.verification.level}
                      </span>
                      <div style={{ marginTop: 6, fontSize: 13 }}>{row.verification.label}</div>
                      <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>
                        {row.guild_label}
                      </div>
                    </td>
                    <td className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      {formatLastVerifiedLine(row.last_verified_at)}
                    </td>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          alignItems: 'flex-start',
                        }}
                      >
                        {!isEditing && (
                          <>
                            <button
                              type="button"
                              onClick={() => void startEdit(row)}
                              disabled={disableModify}
                            >
                              Modifier
                            </button>
                            <button type="button" onClick={() => void onVerifyRow(row.id)} disabled={disableVerify}>
                              {rowVerifying ? 'Vérification…' : 'Vérifier'}
                            </button>
                          </>
                        )}
                        {isEditing && (
                          <>
                            <button
                              type="button"
                              className="primary"
                              onClick={() => void saveRow(row.id, row)}
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
