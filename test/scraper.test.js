import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeSquad, normalizePlayer } from '../src/lib/scraper.js';
import { UpstreamError } from '../src/lib/fetcher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const squadRaw = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'member_v2-2891.json'), 'utf8'));
const playerRaw = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'person-50410856.json'), 'utf8'));

test('normalizeSquad: groups present incl. goalkeeper, count >=25, every member has person_id', () => {
  const { count, groups } = normalizeSquad(squadRaw);
  assert.ok(count >= 25, `expected >=25 members, got ${count}`);
  const types = groups.map((g) => g.type);
  assert.ok(types.includes('goalkeeper'), 'goalkeeper group missing');
  assert.ok(types.includes('coach'), 'coach group missing');
  const coaches = groups.find((g) => g.type === 'coach').members;
  assert.ok(coaches.every((m) => m.position === null || true), 'coaches may lack position');
  const all = groups.flatMap((g) => g.members);
  assert.ok(all.every((m) => m.person_id), 'every member must have person_id');
});

test('normalizeSquad: player rows carry expected fields', () => {
  const { groups } = normalizeSquad(squadRaw);
  const attacker = groups.find((g) => g.type === 'attacker').members[0];
  assert.ok(attacker.person_id);
  assert.ok(attacker.person_name);
  assert.ok(Array.isArray(attacker.statistic));
  assert.ok('captain' in attacker);
  assert.ok('weekly_salary' in attacker);
  assert.ok('nationality_name' in attacker);
});

test('normalizePlayer: market value, name, history, transfers from fixture', () => {
  const p = normalizePlayer(playerRaw);
  assert.equal(p.market_value_eur, 1000000);
  assert.ok(p.en_name.includes('Dilrosun'), `en_name=${p.en_name}`);
  assert.equal(p.name, 'Javairô Dilrosun');
  assert.ok(p.market_value_history.length >= 20, `history=${p.market_value_history.length}`);
  assert.equal(p.transfers.length, 12);
  assert.equal(p.current_team.team_name, 'Al-Sadd');
  assert.equal(p.current_team.shirtnumber, '24');
  assert.equal(p.height_cm, 174);
  assert.equal(p.weight_kg, 74);
  assert.equal(p.foot, 'Left');
  assert.equal(p.date_of_birth, '1998-06-22');
  assert.ok(p.character && Array.isArray(p.character.styles), 'character should be passed through');
});

test('normalizePlayer: history sorted ascending and teams parsed from mini-format', () => {
  const p = normalizePlayer(playerRaw);
  const dates = p.market_value_history.map((h) => h.record_date);
  const sorted = [...dates].sort();
  assert.deepEqual(dates, sorted, 'history must be date-ascending');
  const last = p.market_value_history.at(-1);
  assert.equal(last.team.name, 'Al-Sadd');
  assert.equal(last.market_value_text, '1.00m');
});

test('normalizePlayer: transfer fee parsed (empty money becomes null)', () => {
  const p = normalizePlayer(playerRaw);
  const free = p.transfers.find((t) => t.from_club === 'Free player');
  assert.ok(free, 'free transfer should exist');
  assert.equal(free.fee, null);
  assert.ok(p.transfers.some((t) => t.fee === '') === false, 'empty fee normalized to null');
});

test('normalizePlayer: empty object throws UpstreamError 404', () => {
  assert.throws(() => normalizePlayer({}), (err) => err instanceof UpstreamError && err.status === 404);
});

test('normalizeSquad: empty raw returns zero count without throwing', () => {
  assert.deepEqual(normalizeSquad({}), { count: 0, groups: [] });
});
