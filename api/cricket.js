// /api/cricket.js — Vercel Serverless Function
// cricketdata.org ফ্রি API থেকে লাইভ ও শিডিউলড ক্রিকেট ম্যাচ
// Key: Vercel Environment Variable — CRICKET_API_KEY

const CACHE = { data: null, ts: 0 };
const CACHE_MS = 5 * 60 * 1000; // 5 মিনিট cache

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (CACHE.data && Date.now() - CACHE.ts < CACHE_MS) {
    return res.status(200).json({ source: 'cache', matches: CACHE.data });
  }

  const KEY = process.env.CRICKET_API_KEY;
  if (!KEY) {
    return res.status(500).json({ error: 'CRICKET_API_KEY not set in Vercel env' });
  }

  try {
    // upcoming/live matches
    const [upRes, liveRes] = await Promise.all([
      fetch(`https://api.cricketdata.org/api/v1/matches?apikey=${KEY}&offset=0&status=upcoming`, { signal: AbortSignal.timeout(8000) }),
      fetch(`https://api.cricketdata.org/api/v1/currentMatches?apikey=${KEY}&offset=0`, { signal: AbortSignal.timeout(8000) }),
    ]);

    const [upJson, liveJson] = await Promise.all([upRes.json(), liveRes.json()]);

    const seen = new Set();
    const allRaw = [
      ...(liveJson.data?.data  || []),
      ...(upJson.data?.data    || []),
    ];

    const matches = allRaw
      .filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        // শুধু আন্তর্জাতিক ম্যাচ রাখি (Test/ODI/T20I)
        const t = (m.matchType || '').toUpperCase();
        return t === 'TEST' || t === 'ODI' || t === 'T20I' || t === 'T20';
      })
      .slice(0, 20)
      .map(m => {
        const teams = m.teams || [];
        const A = { n: teams[0] || 'Team A', f: flagOf(teams[0]) };
        const B = { n: teams[1] || 'Team B', f: flagOf(teams[1]) };

        // cricketdata.org returns date as "YYYY-MM-DD" and time as "HH:MM" (UTC)
        const startISO = m.dateTimeGMT
          ? new Date(m.dateTimeGMT).toISOString()
          : new Date(`${m.date}T${m.time || '00:00'}:00Z`).toISOString();

        const type = (m.matchType || 'T20I').toUpperCase();
        const durationMin = type === 'TEST' ? 2880 : type === 'ODI' ? 480 : 210;

        const isFinished = m.matchEnded === true;

        return {
          id:          `cr_${m.id}`,
          sport:       'cricket',
          league:      sanitize(m.series || m.name || 'International Cricket'),
          li:          '🏏',
          A, B,
          startISO,
          durationMin,
          venue:       sanitize(m.venue || m.name || ''),
          hot:         isHotTeam(A.n, B.n),
          final:       isFinished && m.status ? parseScore(m.status, A.n, B.n) : null,
        };
      });

    CACHE.data = matches;
    CACHE.ts = Date.now();
    return res.status(200).json({ source: 'api', matches });
  } catch (e) {
    if (CACHE.data) return res.status(200).json({ source: 'stale_cache', matches: CACHE.data });
    return res.status(500).json({ error: e.message });
  }
}

function sanitize(s) {
  return String(s || '').replace(/[^\w\s.,'()\-]/g, '').trim().slice(0, 60);
}

function parseScore(status, nameA) {
  // status string like "India won by 5 wkts (Score: 245/5 & 183)"
  const parts = String(status).match(/(\d+\/?\d*)/g);
  if (parts && parts.length >= 2) return { a: parts[0], b: parts[1] };
  if (parts && parts.length === 1) return { a: parts[0], b: '—' };
  return null;
}

function isHotTeam(a, b) {
  const hot = ['India','Pakistan','Australia','England','Bangladesh',
               'South Africa','West Indies','Sri Lanka','New Zealand','Afghanistan'];
  return hot.some(t => (a||'').includes(t) || (b||'').includes(t));
}

function flagOf(name) {
  if (!name) return '🏏';
  const n = name.toLowerCase();
  if (n.includes('india'))       return '🇮🇳';
  if (n.includes('pakistan'))    return '🇵🇰';
  if (n.includes('australia'))   return '🇦🇺';
  if (n.includes('england'))     return '🏴';
  if (n.includes('bangladesh'))  return '🇧🇩';
  if (n.includes('south africa'))return '🇿🇦';
  if (n.includes('west indies')) return '🏝️';
  if (n.includes('sri lanka'))   return '🇱🇰';
  if (n.includes('new zealand')) return '🇳🇿';
  if (n.includes('afghanistan')) return '🇦🇫';
  if (n.includes('zimbabwe'))    return '🇿🇼';
  if (n.includes('ireland'))     return '🇮🇪';
  if (n.includes('scotland'))    return '🏴';
  if (n.includes('nepal'))       return '🇳🇵';
  if (n.includes('oman'))        return '🇴🇲';
  if (n.includes('uae'))         return '🇦🇪';
  if (n.includes('usa'))         return '🇺🇸';
  if (n.includes('namibia'))     return '🇳🇦';
  if (n.includes('kenya'))       return '🇰🇪';
  return '🏏';
}
