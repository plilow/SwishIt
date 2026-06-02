import { useState, useEffect } from "react";
import Header from "./components/Header";
import MultiplierSelector from "./components/MultiplierSelector";
import BookmakerSelector from "./components/BookmakerSelector";
import GamePicker from "./components/GamePicker";
import ParlaySlip from "./components/ParlaySlip";
import GenerateButton from "./components/GenerateButton";
import "./App.css";

const API_BASE = "http://localhost:3001/api";

export default function App() {
  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesError, setGamesError] = useState(null);

  const [multiplier, setMultiplier] = useState(5);
  const [locked, setLocked] = useState([]);

  const [bookmaker, setBookmaker] = useState("draftkings");
  const [bookmakerRegion, setBookmakerRegion] = useState("us");

  const [parlay, setParlay] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);

  // Tracks whether the user has already generated a parlay with the current picks.
  // When true, the next generate call sends regenerate: true to bypass the cache.
  const [hasGenerated, setHasGenerated] = useState(false);

  function handleBookmakerChange(key, region) {
    setBookmaker(key);
    setBookmakerRegion(region);
    setLocked([]);
    setParlay(null);
    setHasGenerated(false);
  }

  // Fetch today's games whenever bookmaker changes
  useEffect(() => {
    setGamesLoading(true);
    setGamesError(null);
    fetch(`${API_BASE}/games?bookmaker=${bookmaker}&region=${bookmakerRegion}`)
      .then((r) => r.json())
      .then((data) => {
        setGames(data.games || []);
        setGamesLoading(false);
      })
      .catch(() => {
        setGamesError("Couldn't load today's games. Is the backend running?");
        setGamesLoading(false);
      });
  }, [bookmaker, bookmakerRegion]);

  function togglePick(pick) {
    setLocked((prev) => {
      const exists = prev.find((p) => p.id === pick.id);
      if (exists) return prev.filter((p) => p.id !== pick.id);
      return [...prev, pick];
    });
    // Picks changed — next generate should not be treated as a regenerate
    setHasGenerated(false);
  }

  function isLocked(id) {
    return locked.some((p) => p.id === id);
  }

  function handleMultiplierChange(val) {
    setMultiplier(val);
    setHasGenerated(false);
  }

  async function generateParlay() {
    setGenerating(true);
    setParlay(null);
    setGenerateError(null);

    try {
      const res = await fetch(`${API_BASE}/parlay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          multiplier,
          bookmaker,
          region: bookmakerRegion,
          locked: locked.map(({ type, team, player, stat, direction, line }) =>
            type === "moneyline"
              ? { type, team, pick: "win" }
              : { type, player, stat, direction, line }
          ),
          // If the user has already generated with these exact picks, bypass the cache
          // so they get a fresh parlay instead of the same result again.
          regenerate: hasGenerated,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Surface rate limit and validation errors directly to the user
        throw new Error(data.error || "Failed to generate parlay");
      }

      setParlay(data.parlay);
      setHasGenerated(true);

      setTimeout(() => {
        document.getElementById("parlay-slip")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err) {
      setGenerateError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="app">
      <Header />

      <main className="main">
        <div className="builder">
          <div className="controls">

            <section className="section">
              <label className="section-label">SPORTSBOOK</label>
              <BookmakerSelector value={bookmaker} onChange={handleBookmakerChange} />
            </section>

            <section className="section">
              <label className="section-label">TARGET MULTIPLIER</label>
              <MultiplierSelector value={multiplier} onChange={handleMultiplierChange} />
            </section>

            <section className="section">
              <label className="section-label">
                LOCK IN PICKS
                {locked.length > 0 && (
                  <span className="pick-count">{locked.length} locked</span>
                )}
              </label>
              <p className="section-hint">
                Select teams or players to lock into your parlay. Leave empty to let AI decide everything.
              </p>

              {gamesLoading && <div className="status-text">Loading today's games...</div>}
              {gamesError && <div className="status-text error">{gamesError}</div>}
              {!gamesLoading && !gamesError && games.length === 0 && (
                <div className="status-text">No games available for this sportsbook today.</div>
              )}

              {games.map((game) => (
                <GamePicker
                  key={game.id}
                  game={game}
                  locked={locked}
                  isLocked={isLocked}
                  onToggle={togglePick}
                />
              ))}
            </section>

            <GenerateButton
              onClick={generateParlay}
              loading={generating}
              multiplier={multiplier}
              lockedCount={locked.length}
            />

            {generateError && (
              <div className="generate-error">{generateError}</div>
            )}
          </div>

          <div className="slip-column" id="parlay-slip">
            <ParlaySlip parlay={parlay} generating={generating} />
          </div>
        </div>
      </main>

      <footer className="app-footer">
        Made by <a href="https://www.linkedin.com/in/cs-danielcao/" target="_blank" rel="noreferrer">Daniel Cao</a>
      </footer>
    </div>
  );
}