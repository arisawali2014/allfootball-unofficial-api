import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseLeagues, parseTeams, decodeEntities } from '../src/lib/parsers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const standingsHtml = readFileSync(join(__dirname, 'fixtures', 'standings-196.html'), 'utf8');

test('parseLeagues: real fixture has >=250 leagues', () => {
  const leagues = parseLeagues(standingsHtml);
  assert.ok(leagues.length >= 250, `expected >=250 leagues, got ${leagues.length}`);
});

test('parseLeagues: includes cid 196 Qatar Stars League and cid 61 World Cup', () => {
  const leagues = parseLeagues(standingsHtml);
  const qatar = leagues.find((l) => l.cid === '196');
  assert.ok(qatar, 'cid=196 missing');
  assert.equal(qatar.name, 'Qatar - Liga Utama');
  assert.ok(qatar.logo && qatar.logo.startsWith('http'), 'logo should be an http URL');
  const wc = leagues.find((l) => l.cid === '61');
  assert.ok(wc, 'cid=61 missing');
  assert.equal(wc.name, 'Piala Dunia');
});

test('parseTeams: real fixture has exactly 12 Qatar clubs incl. 2891 al-sadd and 140622', () => {
  const teams = parseTeams(standingsHtml);
  assert.equal(teams.length, 12, `expected 12 teams, got ${teams.length}`);
  const sadd = teams.find((t) => t.team_id === '2891');
  assert.ok(sadd, 'Al-Sadd missing');
  assert.equal(sadd.slug, 'al-sadd');
  assert.equal(sadd.name, 'Al-Sadd');
  assert.ok(sadd.logo && sadd.logo.startsWith('http'), 'team logo should be an http URL');
  assert.ok(teams.find((t) => t.team_id === '140622'), 'Lusail SC missing');
});

test('parseLeagues: dedupes by cid, first wins', () => {
  const html = `
    <a href="/id/data/?cid=7&amp;tab=standings&amp;expanded=1"><img src="http://a/1.png"><span>First</span></a>
    <a href="/id/data/?cid=7&amp;tab=standings&amp;expanded=1"><img src="http://b/2.png"><span>Second</span></a>
  `;
  const leagues = parseLeagues(html);
  assert.equal(leagues.length, 1);
  assert.equal(leagues[0].name, 'First');
  assert.equal(leagues[0].logo, 'http://a/1.png');
});

test('parseLeagues: decodes HTML entities in name', () => {
  const html = '<a href="/id/data/?cid=1&amp;tab=standings&amp;expanded=1"><img src="http://a/b.png" alt=""><span>A &amp; B &lt; C&gt;</span></a>';
  const leagues = parseLeagues(html);
  assert.equal(leagues[0].name, 'A & B < C>');
});

test('parseLeagues: empty/garbage input returns []', () => {
  assert.deepEqual(parseLeagues(''), []);
  assert.deepEqual(parseLeagues('<html>no anchors here</html>'), []);
});

test('parseTeams: empty/garbage input returns []', () => {
  assert.deepEqual(parseTeams(''), []);
  assert.deepEqual(parseTeams('<html>nothing</html>'), []);
});

test('decodeEntities maps the common set', () => {
  assert.equal(decodeEntities('a &amp; b &#39;c&#39; &quot;d&quot; &lt;e&gt; &nbsp; f'), 'a & b \'c\' "d" <e>   f');
});
