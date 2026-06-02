require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Gemini setup ──────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: { responseMimeType: "application/json" },
});

// ── Odds API helpers ──────────────────────────────────────
const ODDS_BASE = "https://api.the-odds-api.com/v4";
const SPORT = "basketball_nba";

async function fetchMoneylines(bookmaker = "draftkings", region = "us") {
  const url = `${ODDS_BASE}/sports/${SPORT}/odds/?apiKey=${process.env.ODDS_API_KEY}&regions=${region}&markets=h2h&bookmakers=${bookmaker}&oddsFormat=american`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API error: ${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchPlayerProps(eventIds, bookmaker = "draftkings", region = "us") {
  const props = [];
  for (const eventId of eventIds.slice(0, 3)) {
    const url = `${ODDS_BASE}/sports/${SPORT}/events/${eventId}/odds?apiKey=${process.env.ODDS_API_KEY}&regions=${region}&markets=player_points,player_assists,player_rebounds&bookmakers=${bookmaker}&oddsFormat=american`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const data = await res.json();
    props.push(data);
  }
  return props;
}

// ── NBA Stats helpers (Python microservice) ───────────────
const STATS_BASE = "https://swishit-production-e247.up.railway.app";


async function fetchStatsForPlayers(playerNames) {
  const statsMap = {};
  for (const name of playerNames.slice(0, 8)) {
    try {
      const res = await fetch(`${STATS_BASE}/stats?player=${encodeURIComponent(name)}&games=10`);
      if (!res.ok) continue;
      const data = await res.json();
      statsMap[name] = data;
    } catch (e) {
      console.error(`Stats fetch failed for ${name}:`, e.message);
    }
  }
  return statsMap;
}

function formatStatsForPrompt(statsMap) {
  const entries = Object.entries(statsMap);
  if (entries.length === 0) return "No recent player stats available.";
  return entries
    .map(([name, s]) =>
      `${name}: ${s.pts} PPG, ${s.ast} APG, ${s.reb} RPG (last ${s.games} PLAYOFF games, 2024-25 playoffs)`
    )
    .join("\n");
}

// ── Formatting helpers ────────────────────────────────────
function formatGamesForPrompt(games) {
  return games
    .map((game) => {
      const dk = game.bookmakers?.[0];
      const h2h = dk?.markets?.find((m) => m.key === "h2h");
      if (!h2h) return null;
      const home = h2h.outcomes.find((o) => o.name === game.home_team);
      const away = h2h.outcomes.find((o) => o.name === game.away_team);
      return `${game.away_team} @ ${game.home_team}
  - ${game.away_team} ML: ${away?.price > 0 ? "+" : ""}${away?.price}
  - ${game.home_team} ML: ${home?.price > 0 ? "+" : ""}${home?.price}
  - Game time: ${new Date(game.commence_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function formatPropsForPrompt(propsData) {
  const lines = [];
  for (const event of propsData) {
    const dk = event.bookmakers?.[0];
    if (!dk) continue;
    lines.push(`\n${event.away_team} @ ${event.home_team} — Player Props:`);
    for (const market of dk.markets || []) {
      const label = market.key.replace("player_", "").replace("_", " ").toUpperCase();
      for (const outcome of market.outcomes || []) {
        const dir = outcome.name.includes("Over") ? "Over" : "Under";
        const player = outcome.description || outcome.name;
        const odds = outcome.price > 0 ? `+${outcome.price}` : outcome.price;
        lines.push(`  ${player} — ${label} ${dir} ${outcome.point ?? ""} (${odds})`);
      }
    }
  }
  return lines.join("\n");
}

function formatGamesForClient(games, propsData) {
  return games.map((game) => {
    const dk = game.bookmakers?.[0];
    const h2h = dk?.markets?.find((m) => m.key === "h2h");
    const home = h2h?.outcomes.find((o) => o.name === game.home_team);
    const away = h2h?.outcomes.find((o) => o.name === game.away_team);

    const eventProps = propsData.find((p) => p.id === game.id);
    const dkProps = eventProps?.bookmakers?.[0];
    const players = [];
    for (const market of dkProps?.markets || []) {
      for (const outcome of market.outcomes || []) {
        const playerName = outcome.description || outcome.name;
        if (!players.find((p) => p.name === playerName)) {
          players.push({ name: playerName });
        }
      }
    }

    return {
      id: game.id,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      commenceTime: game.commence_time,
      odds: { home: home?.price ?? null, away: away?.price ?? null },
      players,
    };
  });
}



// ── Gemini parlay generator ───────────────────────────────
async function generateParlay(userSelections, gamesText, propsText, statsText) {
  const americanOddsTarget = (userSelections.multiplier - 1) * 100;

  const lockedText =
    userSelections.locked?.length > 0
      ? `\nUSER'S LOCKED PICKS (must be included):\n${userSelections.locked
          .map((l) =>
            l.type === "moneyline"
              ? `- ${l.team} to win`
              : `- ${l.player} ${l.stat} ${l.direction} ${l.line}`
          )
          .join("\n")}`
      : "";

  const dfsOdds = {
  underdog: -130,
  prizepicks: -122,
  pick6: -122,
  betr_us_dfs: -110,
};

const isDFS = Object.keys(dfsOdds).includes(userSelections.bookmaker);
const legOdds = isDFS ? dfsOdds[userSelections.bookmaker] : null;

const oddsNote = isDFS
  ? `IMPORTANT: This is a DFS pick-em site. All player prop legs have fixed odds of ${legOdds}. Use ${legOdds} for every single leg.`
  : `Use the actual odds from the provided lines above for each leg.`;
const prompt = `You are SwishIt, an expert NBA parlay builder. You analyze live odds, player prop lines, and recent player performance to construct smart, value-based parlays.

${oddsNote}

MULTIPLIER MATH — always calculate this way, never guess:
1. Convert each leg's American odds to decimal:
   - Negative odds (e.g. -110): decimal = (100 / 110) + 1 = 1.909
   - Positive odds (e.g. +150): decimal = (150 / 100) + 1 = 2.5
2. Multiply all leg decimals together to get combined decimal
3. Combined American odds = (combined_decimal - 1) * 100, add "+" if positive
4. Multiplier = combined_decimal rounded to 1 decimal place
Example: 5 legs at -110 = 1.909^5 = 25.1x, combined odds = +2510
Your job:
1. Build a parlay that hits approximately ${userSelections.multiplier}x payout (combined American odds near +${americanOddsTarget})
2. Include any locked picks the user specified
3. Fill remaining legs with the highest-value picks using a combination of:
   - Recent player stats (provided below)
   - Current playoff/season context (Finals, conference finals, awards races, elimination games)
   - Team matchup dynamics (pace, defensive scheme, foul trouble history, rest days)
   - Player role and usage in this specific series or game context
   - Momentum and narrative (hot streaks, slumps, revenge games, home/away splits)
4. Use recent player averages as a starting point but not the final word:
   - If a player averages significantly MORE than the line → lean Over, but consider matchup
   - If a player averages significantly LESS than the line → lean Under, but consider if role has changed
   - A player on a hot streak or in a must-win game may outperform their average
   - A player being guarded by an elite defender may underperform even a low line
5. Prefer props where multiple factors (stats + matchup + context) align in the same direction
6. Aim for a mix of Overs and Unders — do not default to all Overs
7. Write reasoning and use reasoning that feels like an expert analyst, not a statistics report:
   - Bad: "Player averages 8.9 RPG which is above the 7.5 line"
   - Good: "Hart has been a rebounding machine with his recent stats, attacking the glass aggressively in crunch time — the 7.5 line feels like a gift given his playoff motor"
Respond ONLY with a JSON object in this exact shape:
{
  "legs": [
    {
      "type": "moneyline or player_prop",
      "description": "Short human-readable label",
      "pick": "e.g. Lakers ML or LeBron James Over 24.5 PTS",
      "odds": -110,
      "reasoning": "One sentence why this leg has value, referencing recent stats where relevant"
    }
  ],
  "combined_odds": "+412",
  "approx_multiplier": "5.1x",
  "summary": "2-3 sentence narrative on why this parlay makes sense tonight, citing specific stats"
}

---

Build me a ${userSelections.multiplier}x parlay for tonight's NBA games.
${lockedText}

TODAY'S GAMES & MONEYLINES:
${gamesText}

PLAYER PROPS:
${propsText}

RECENT PLAYER STATS (last 10 games):
${statsText}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text();

  try {
    const cleaned = raw
      .replace(/```json|```/g, "")
      .trim()
      .replace(/"odds"\s*:\s*\+(\d+)/g, '"odds": $1');
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("JSON parse failed. Raw response:", raw);
    throw new Error("AI returned invalid JSON: " + e.message);
  }
}

// ── Routes ────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "SwishIt API is running 🏀" });
});

app.get("/api/games", async (req, res) => {
  try {
    const { bookmaker = "draftkings", region = "us" } = req.query;
    const games = await fetchMoneylines(bookmaker, region);

    if (!games.length) {
      return res.json({ games: [], message: "No NBA games today" });
    }

    const eventIds = games.map((g) => g.id);
    const propsData = await fetchPlayerProps(eventIds, bookmaker, region);
    const formatted = formatGamesForClient(games, propsData);

    res.json({ games: formatted });
  } catch (err) {
    console.error("GET /api/games error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/parlay", async (req, res) => {
  try {
    const { multiplier, locked = [], bookmaker = "draftkings", region = "us" } = req.body;

    if (!multiplier || typeof multiplier !== "number") {
      return res.status(400).json({ error: "multiplier is required and must be a number" });
    }
    if (multiplier < 2 || multiplier > 20) {
      return res.status(400).json({ error: "multiplier must be between 2 and 20" });
    }

    // Fetch odds data
    const games = await fetchMoneylines(bookmaker, region);
    if (!games.length) {
      return res.status(404).json({ error: "No NBA games available today" });
    }

    const eventIds = games.map((g) => g.id);
    const propsData = await fetchPlayerProps(eventIds, bookmaker, region);

    // Collect all player names from props
    const playerNames = [];
    for (const event of propsData) {
      const bk = event.bookmakers?.[0];
      for (const market of bk?.markets || []) {
        for (const outcome of market.outcomes || []) {
          const name = outcome.description || outcome.name;
          if (name && !playerNames.includes(name)) playerNames.push(name);
        }
      }
    }

    // Also include any locked player names
    for (const pick of locked) {
      if (pick.type === "player_prop" && pick.player && !playerNames.includes(pick.player)) {
        playerNames.push(pick.player);
      }
    }

    // Fetch recent stats from BallDontLie
    console.log(`Fetching stats for ${playerNames.length} players...`);
    const statsMap = await fetchStatsForPlayers(playerNames);
    console.log(`Got stats for ${Object.keys(statsMap).length} players`);

    const gamesText = formatGamesForPrompt(games);
    const propsText = formatPropsForPrompt(propsData);
    const statsText = formatStatsForPrompt(statsMap);

    const parlay = await generateParlay({ multiplier, locked, bookmaker }, gamesText, propsText, statsText);

    res.json({ parlay });
  } catch (err) {
    console.error("POST /api/parlay error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏀 SwishIt API running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
});