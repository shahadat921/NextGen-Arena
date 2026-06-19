// /api/football.js — Vercel Serverless Function
// PRIMARY: openfootball/worldcup.json — সম্পূর্ণ schedule, সঠিক UTC offset, key লাগে না
// OVERLAY: worldcup26.ir — live score + finished status (যখনই match হয়)
// দুটোই fail করলে empty array রিটার্ন করে, frontend নিজেই static fallback ব্যবহার করবে

const CACHE = { data: null, ts: 0 };
const CACHE_MS = 5 * 60 * 1000; // 5 মিনিট

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (CACHE.data && Date.now() - CACHE.ts < CACHE_MS) {
    return res.status(200).json({ source: 'cache', matches: CACHE.data });
  }

  let schedule = null;
  let liveGames = null;

  // ── PRIMARY: openfootball schedule ──
  try {
    const r = await fetch(
      'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json',
      { signal: AbortSignal.timeout(4000) }
    );
    if (r.ok) {
      const json = await r.json();
      schedule = json.matches || [];
    }
  } catch (e) { /* timeout বা network fail — schedule null থাকবে */ }

  // ── OVERLAY: worldcup26.ir live score ──
  try {
    const r2 = await fetch('https://worldcup26.ir/get/games', { signal: AbortSignal.timeout(4000) });
    if (r2.ok) {
      const json2 = await r2.json();
      liveGames = json2.games || (Array.isArray(json2) ? json2 : null);
    }
  } catch (e) { /* fail করলে liveGames null থাকবে, score overlay হবে না */ }

  if (!schedule) {
    // primary source fail — frontend নিজে static fallback ব্যবহার করবে
    if (CACHE.data) return res.status(200).json({ source: 'stale_cache', matches: CACHE.data });
    return res.status(200).json({ source: 'none', matches: [], error: 'schedule source unavailable' });
  }

  const matches = schedule.map((m, idx) => {
    const startISO = toUTCISO(m.date, m.time);
    const live = liveGames ? findLiveMatch(liveGames, m) : null;
    const isFinished = live && String(live.finished).toUpperCase() === 'TRUE';

    return {
      id: `fb_${m.num || idx}_${m.date}`,
      sport: 'football',
      league: `FIFA WORLD CUP 2026 • ${m.group ? 'GROUP ' + m.group.replace('Group ', '') : (m.round || 'KNOCKOUT')}`,
      li: '🏆',
      A: { n: m.team1, f: flagOf(m.team1) },
      B: { n: m.team2, f: flagOf(m.team2) },
      venue: m.ground || '',
      startISO: startISO || new Date().toISOString(),
      durationMin: 130,
      hot: isHot(m.team1, m.team2),
      final: isFinished ? { a: String(live.home_score ?? '—'), b: String(live.away_score ?? '—') } : null,
    };
  }).filter(m => m.startISO);

  CACHE.data = matches;
  CACHE.ts = Date.now();
  return res.status(200).json({ source: liveGames ? 'api+live' : 'api', matches });
}

// "2026-06-18" + "12:00 UTC-4"  →  সঠিক UTC ISO string
function toUTCISO(dateStr, timeStr) {
  try {
    const tm = String(timeStr).match(/(\d{1,2}):(\d{2})\s*UTC([+-]\d+)/i);
    if (!tm || !dateStr) return null;
    const [, hh, mm, off] = tm;
    const [y, mo, d] = dateStr.split('-').map(Number);
    const offsetHours = parseInt(off, 10);
    const utcMs = Date.UTC(y, mo - 1, d, Number(hh), Number(mm)) - offsetHours * 3600000;
    return new Date(utcMs).toISOString();
  } catch (e) { return null; }
}

// দল নামের ছোটখাটো ভিন্নতা মিলিয়ে live score খোঁজে
function findLiveMatch(games, m) {
  const a = canon(m.team1), b = canon(m.team2);
  return games.find(g => {
    const ga = canon(g.home_team_name_en), gb = canon(g.away_team_name_en);
    return (ga === a && gb === b) || (ga === b && gb === a);
  }) || null;
}

const ALIASES = {
  'south korea': 'korea republic', 'korea republic': 'korea republic',
  'cabo verde': 'cape verde', 'cape verde': 'cape verde',
  'czechia': 'czech republic', 'czech republic': 'czech republic',
  'ivory coast': 'cote divoire', 'cote divoire': 'cote divoire',
  'usa': 'united states', 'united states': 'united states',
  'uae': 'united arab emirates',
};
function norm(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, '').trim();
}
function canon(s) { const n = norm(s); return ALIASES[n] || n; }

function flagOf(name) {
  const map = {
    'brazil':'🇧🇷','argentina':'🇦🇷','france':'🇫🇷','germany':'🇩🇪','england':'🏴',
    'spain':'🇪🇸','portugal':'🇵🇹','netherlands':'🇳🇱','belgium':'🇧🇪','italy':'🇮🇹',
    'usa':'🇺🇸','mexico':'🇲🇽','canada':'🇨🇦','uruguay':'🇺🇾','colombia':'🇨🇴',
    'south africa':'🇿🇦','south korea':'🇰🇷','korea republic':'🇰🇷','japan':'🇯🇵',
    'australia':'🇦🇺','morocco':'🇲🇦','egypt':'🇪🇬','tunisia':'🇹🇳','algeria':'🇩🇿',
    'ghana':'🇬🇭','senegal':'🇸🇳','ivory coast':'🇨🇮','switzerland':'🇨🇭','croatia':'🇭🇷',
    'qatar':'🇶🇦','saudi arabia':'🇸🇦','iran':'🇮🇷','jordan':'🇯🇴','uzbekistan':'🇺🇿',
    'scotland':'🏴','norway':'🇳🇴','austria':'🇦🇹','haiti':'🇭🇹','panama':'🇵🇦',
    'paraguay':'🇵🇾','curaçao':'🇨🇼','curacao':'🇨🇼','ecuador':'🇪🇨','cape verde':'🇨🇻',
    'cabo verde':'🇨🇻','new zealand':'🇳🇿','sweden':'🇸🇪',
  };
  return map[norm(name)] || '🏴';
}

function isHot(a, b) {
  const hot = ['Brazil','Argentina','France','Germany','Spain','England',
               'Portugal','Netherlands','Belgium','USA','Mexico'];
  return hot.includes(a) || hot.includes(b);
}
