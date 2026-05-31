/**
 * SwishIt - NBA Parlay Generator (Proof of Concept)
 *
 * What this does:
 *   1. Fetches today's NBA games + player props from The Odds API
 *   2. Builds a structured prompt with live odds + recent context
 *   3. Sends it to Gemini to generate a parlay
 *   4. Logs the parlay slip to the console
 *
 * Setup:
 *   npm install node-fetch@2 dotenv @google/generative-ai
 *   Add ODDS_API_KEY and GEMINI_API_KEY to .env
 */

require("dotenv").config();
const fetch = require("node-fetch");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const ODDS_BASE = "https://api.the-odds-api.com/v4";
const SPORT = "basketball_nba";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro",
  generationConfig: {
    responseMimeType: "application/json", // forces Gemini to return clean JSON
  },
});

// ─────────────────────────────────────────────
// 1. FETCH ODDS DATA
// ─────────────────────────────────────────────

/**
 * Fetch today's NBA moneylines from DraftKings (via The Odds API)
 */
async function fetchMoneylines() {
  const url = `${ODDS_BASE}/sports/${SPORT}/odds/?apiKey=${process.env.ODDS_API_KEY}&regions=us&markets=h2h&bookmakers=draftkings&oddsFormat=american`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API error: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Fetch player props (points, assists, rebounds) for today's games
 * The Odds API requires an eventId per game for player props
 */
async function fetchPlayerProps(eventIds) {
  const props = [];

  for (const eventId of eventIds.slice(0, 3)) { // cap at 3 games to save API quota
    const url = `${ODDS_BASE}/sports/${SPORT}/events/${eventId}/odds?apiKey=${process.env.ODDS_API_KEY}&regions=us&markets=player_points,player_assists,player_rebounds&bookmakers=draftkings&oddsFormat=american`;
    const res = await fetch(url);
    if (!res.ok) continue; // skip if props unavailable for this game
    const data = await res.json();
    props.push(data);
  }

  return props;
}

// ─────────────────────────────────────────────
// 2. FORMAT DATA FOR GEMINI
// ─────────────────────────────────────────────

function formatGamesForPrompt(games) {
  return games
    .map((game) => {
      const dk = game.bookmakers?.find((b) => b.key === "draftkings");
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
    const dk = event.bookmakers?.find((b) => b.key === "draftkings");
    if (!dk) continue;

    lines.push(`\n${event.away_team} @ ${event.home_team} — Player Props:`);

    for (const market of dk.markets || []) {
      const label = market.key
        .replace("player_", "")
        .replace("_", " ")
        .toUpperCase();

      for (const outcome of market.outcomes || []) {
        const dir = outcome.name.includes("Over") ? "Over" : "Under";
        const player = outcome.description || outcome.name;
        const odds = outcome.price > 0 ? `+${outcome.price}` : outcome.price;
        lines.push(
          `  ${player} — ${label} ${dir} ${outcome.point ?? ""} (${odds})`
        );
      }
    }
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────
// 3. BUILD + SEND GEMINI PROMPT
// ─────────────────────────────────────────────

/**
 * userSelections example:
 * {
 *   multiplier: 5,
 *   locked: [
 *     { type: "moneyline", team: "Los Angeles Lakers", pick: "win" },
 *     { type: "player_prop", player: "LeBron James", stat: "points", direction: "over", line: 24.5 }
 *   ]
 * }
 */
async function generateParlay(userSelections, gamesText, propsText) {
  // Convert multiplier to approximate combined American odds target
  // 5x payout on a $100 bet = +400, 6x = +500, etc.
  const decimalOdds = userSelections.multiplier;
  const americanOddsTarget = (decimalOdds - 1) * 100;

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

  const prompt = `You are SwishIt, an expert NBA parlay builder. You analyze live odds and player prop lines to construct smart parlays.

Your job:
1. Build a parlay that hits approximately ${userSelections.multiplier}x payout (combined American odds near +${americanOddsTarget})
2. Include any locked picks the user specified
3. Fill remaining legs with the highest-value picks given the available lines
4. Prefer picks where the odds suggest value (e.g. a player averaging 28 PPG on an Over 24.5 line)

Respond ONLY with a JSON object in this exact shape:
{
  "legs": [
    {
      "type": "moneyline or player_prop",
      "description": "Short human-readable label",
      "pick": "e.g. Lakers ML or LeBron James Over 24.5 PTS",
      "odds": -110,
      "reasoning": "One sentence why this leg has value"
    }
  ],
  "combined_odds": "+412",
  "approx_multiplier": "5.1x",
  "summary": "2-3 sentence narrative on why this parlay makes sense tonight"
}

---

Build me a ${userSelections.multiplier}x parlay for tonight's NBA games.
${lockedText}

TODAY'S GAMES & MONEYLINES:
${gamesText}

PLAYER PROPS:
${propsText}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text();

  try {
    return JSON.parse(raw);
  } catch {
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  }
}

// ─────────────────────────────────────────────
// 4. PRETTY PRINT THE PARLAY SLIP
// ─────────────────────────────────────────────

function printParlaySlip(parlay) {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║          🏀  SWISHIT PARLAY          ║");
  console.log("╚══════════════════════════════════════╝\n");

  parlay.legs.forEach((leg, i) => {
    console.log(`Leg ${i + 1}: ${leg.pick}`);
    console.log(`  Odds: ${leg.odds > 0 ? "+" : ""}${leg.odds}`);
    console.log(`  Why:  ${leg.reasoning}`);
    console.log("");
  });

  console.log("─────────────────────────────────────");
  console.log(`Combined odds:  ${parlay.combined_odds}`);
  console.log(`~Multiplier:    ${parlay.approx_multiplier}`);
  console.log("─────────────────────────────────────");
  console.log(`\n${parlay.summary}\n`);
}

// ─────────────────────────────────────────────
// 5. MAIN — wire it all together
// ─────────────────────────────────────────────

async function main() {
  // --- Tweak these to simulate different user inputs ---
  const userSelections = {
    multiplier: 5,
    locked: [
      // { type: "moneyline", team: "Los Angeles Lakers", pick: "win" },
      // { type: "player_prop", player: "LeBron James", stat: "points", direction: "over", line: 24.5 },
    ],
  };
  // -----------------------------------------------------

  console.log("Fetching today's NBA games...");
  const games = await fetchMoneylines();

  if (!games.length) {
    console.log("No NBA games found today. Try again on a game day.");
    return;
  }

  console.log(`Found ${games.length} games. Fetching player props...`);
  const eventIds = games.map((g) => g.id);
  const propsData = await fetchPlayerProps(eventIds);

  const gamesText = formatGamesForPrompt(games);
  const propsText = formatPropsForPrompt(propsData);

  console.log("Generating parlay with Gemini...\n");
  const parlay = await generateParlay(userSelections, gamesText, propsText);

  printParlaySlip(parlay);

  // Useful for debugging — see what data Gemini actually received
  if (process.env.DEBUG) {
    console.log("\n── RAW GAMES DATA SENT TO GEMINI ──\n", gamesText);
    console.log("\n── RAW PROPS DATA SENT TO GEMINI ──\n", propsText);
  }
}

main().catch((err) => {
  console.error("SwishIt error:", err.message);
  process.exit(1);
});
