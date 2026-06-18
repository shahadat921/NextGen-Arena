// /api/football.js — Vercel Serverless Function
// football-data.org ফ্রি API থেকে FIFA World Cup 2026 ম্যাচ
// Key: Vercel Environment Variable থেকে নেওয়া হয়, frontend-এ দেখা যাবে না

const CACHE = { data: null, ts: 0 };
const CACHE_MS = 5 * 60 * 1000; // 5 মিনিট cache

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // cache hit
  if (CACHE.data && Date.now() - CACHE.ts < CACHE_MS) {
    return res.status(200).json({ source: 'cache', matches: CACHE.data });
  }

  const KEY = process.env.FOOTBALL_API_KEY;
  if (!KEY) {
    return res.status(500).json({ error: 'FOOTBALL_API_KEY not set in Vercel env' });
  }

  try {
    // FIFA World Cup 2026 competition ID = 2000 (football-data.org)
    const r = await fetch(
      'https://api.football-data.org/v4/competitions/WC/matches?status=SCHEDULED,LIVE,FINISHED&limit=60',
      { headers: { 'X-Auth-Token': KEY } }
    );
    if (!r.ok) throw new Error(`API error ${r.status}`);
    const raw = await r.json();

    const matches = (raw.matches || []).map(m => ({
      id:         `fb_${m.id}`,
      sport:      'football',
      league:     `FIFA WORLD CUP 2026 • ${m.stage?.replace(/_/g,' ') || m.group || 'GROUP STAGE'}`,
      li:         '🏆',
      A:          { n: m.homeTeam.name,    f: teamFlag(m.homeTeam.tla) },
      B:          { n: m.awayTeam.name,    f: teamFlag(m.awayTeam.tla) },
      startISO:   m.utcDate,
      durationMin: 130,
      venue:      m.venue || '',
      hot:        isHot(m.homeTeam.name, m.awayTeam.name),
      final:      m.status === 'FINISHED' ? {
                    a: String(m.score.fullTime.home ?? '—'),
                    b: String(m.score.fullTime.away ?? '—')
                  } : null,
    }));

    CACHE.data = matches;
    CACHE.ts = Date.now();
    return res.status(200).json({ source: 'api', matches });
  } catch (e) {
    // cache stale data যদি থাকে দাও
    if (CACHE.data) return res.status(200).json({ source: 'stale_cache', matches: CACHE.data });
    return res.status(500).json({ error: e.message });
  }
}

// দলের নাম থেকে সম্ভাব্য flag emoji
function teamFlag(tla) {
  const map = {
    'BRA':'🇧🇷','ARG':'🇦🇷','FRA':'🇫🇷','GER':'🇩🇪','ENG':'🏴',
    'ESP':'🇪🇸','POR':'🇵🇹','NED':'🇳🇱','BEL':'🇧🇪','ITA':'🇮🇹',
    'USA':'🇺🇸','MEX':'🇲🇽','CAN':'🇨🇦','URU':'🇺🇾','COL':'🇨🇴',
    'CHI':'🇨🇱','PER':'🇵🇪','ECU':'🇪🇨','PAR':'🇵🇾','BOL':'🇧🇴',
    'CRC':'🇨🇷','PAN':'🇵🇦','JAM':'🇯🇲','HON':'🇭🇳','HTI':'🇭🇹',
    'MAR':'🇲🇦','SEN':'🇸🇳','CMR':'🇨🇲','GHA':'🇬🇭','NGA':'🇳🇬',
    'EGY':'🇪🇬','TUN':'🇹🇳','ALG':'🇩🇿','RSA':'🇿🇦','CIV':'🇨🇮',
    'JPN':'🇯🇵','KOR':'🇰🇷','AUS':'🇦🇺','IRN':'🇮🇷','SAU':'🇸🇦',
    'QAT':'🇶🇦','UAE':'🇦🇪','JOR':'🇯🇴','IRQ':'🇮🇶','BHR':'🇧🇭',
    'SUI':'🇨🇭','CRO':'🇭🇷','SRB':'🇷🇸','POL':'🇵🇱','DEN':'🇩🇰',
    'AUT':'🇦🇹','SWE':'🇸🇪','NOR':'🇳🇴','CZE':'🇨🇿','SVK':'🇸🇰',
    'UKR':'🇺🇦','ROU':'🇷🇴','HUN':'🇭🇺','SCO':'🏴','WAL':'🏴',
    'IRL':'🇮🇪','GRE':'🇬🇷','ALB':'🇦🇱','BIH':'🇧🇦','MNE':'🇲🇪',
    'SLO':'🇸🇮','SVN':'🇸🇮','FIN':'🇫🇮',
  };
  return map[tla] || '🏴';
}

function isHot(a, b) {
  const hot = ['Brazil','Argentina','France','Germany','Spain','England',
               'Portugal','Netherlands','Belgium','USA','Mexico'];
  return hot.some(t => a.includes(t) || b.includes(t));
}
