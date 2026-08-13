// High-level fetchers + normalizers over the verified allfootballapp JSON endpoints.

import { fetchJson, UpstreamError } from './fetcher.js';

const API_BASE = 'https://www.allfootballapp.com/sport-data';

// Upstream is Dongqiudi's backend; the `app` param selects the locale of every
// human-readable string (names, nationalities, positions, foot, age suffix).
// `app=dqd` (the Chinese app) returns 中文 — `app=af` (AllFootball) returns Latin.
const APP = 'af';

export function normalizeSquad(raw) {
  const groups = (raw?.data?.list ?? []).map((group) => ({
    type: group.type,
    members: (group.data ?? []).map((m) => ({
      person_id: m.person_id ?? null,
      person_name: m.person_name ?? null,
      person_en_name: m.person_en_name ?? null,
      age: toInt(m.age),
      shirtnumber: m.shirtnumber ? String(m.shirtnumber) : null,
      position: m.type ?? null,
      statistic: m.statistic ?? [],
      weekly_salary: m.weekly_salary || null,
      nationality_name: m.nationality_name ?? null,
      captain: Boolean(m.captain_logo),
    })),
  }));
  const count = groups.reduce((acc, g) => acc + g.members.length, 0);
  return { count, groups };
}

function toInt(v) {
  const n = Number(String(v ?? '').replace(/\D/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseMiniFormat(s) {
  // team_info is usually an object {id, name, ...}; occasionally a string "@{id=..; name=..; ..}".
  if (s && typeof s === 'object') {
    return { id: s.id ?? null, name: s.name ?? null };
  }
  if (typeof s !== 'string') return { id: null, name: null };
  const id = s.match(/(?:^|[; ])id=([^;]+)/)?.[1];
  const name = s.match(/(?:^|[; ])name=([^;]+)/)?.[1];
  return { id: id ?? null, name: name ?? null };
}

export function normalizePlayer(raw) {
  const base = raw?.base_info;
  if (!base) {
    throw new UpstreamError('Player not found (no base_info)', { status: 404 });
  }
  const team = base.team_info ?? {};
  const history = [];
  const rawHistory = raw.history_market_values ?? {};
  for (const records of Object.values(rawHistory)) {
    for (const r of records ?? []) {
      history.push({
        record_date: r.record_date ?? null,
        market_value: toInt(r.market_value),
        market_value_text: r.market_value_text ?? null,
        age: toInt(r.age),
        team: parseMiniFormat(r.team_info ?? ''),
      });
    }
  }
  history.sort((a, b) => String(a.record_date).localeCompare(String(b.record_date)));

  const transfers = (raw.transfer_info ?? []).map((t) => ({
    date: t.announced_date ?? null,
    from_club: t.from_club_name ?? null,
    to_club: t.to_club_name ?? null,
    fee: t.money || null,
    type: t.type || null,
  }));

  return {
    person_id: base.person_id ?? null,
    name: base.person_name ?? null,
    en_name: base.person_en_name ?? null,
    nationality: base.nationality ?? null,
    other_nationality: base.other_nationality ?? [],
    date_of_birth: base.date_of_birth ?? null,
    height_cm: toInt(base.height),
    weight_kg: toInt(base.weight),
    foot: base.foot ?? null,
    position: base.position ?? null,
    age: toInt(base.age),
    status: base.status ?? null,
    current_team: {
      team_id: team.team_id ?? null,
      team_name: team.team_name ?? null,
      shirtnumber: team.shirtnumber ? String(team.shirtnumber) : null,
    },
    market_value_eur: toInt(base.market_value),
    weekly_salary: base.weekly_salary || null,
    contract: base.contract || null,
    market_value_history: history,
    transfers,
    injuries: raw.injury_records ?? [],
    career: raw.career_info ?? null,
    character: raw.character_info ?? null,
  };
}

export async function getSquad(teamId) {
  const url = `${API_BASE}/soccer/biz/dqd/v1/team/member_v2/${teamId}?app=${APP}`;
  const raw = await fetchJson(url);
  return normalizeSquad(raw);
}

export async function getPlayer(personId) {
  const url = `${API_BASE}/soccer/biz/dqd/person/detail/${personId}?app=${APP}`;
  const raw = await fetchJson(url);
  return normalizePlayer(raw);
}
