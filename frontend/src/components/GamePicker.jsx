import { useState } from "react";
import "./GamePicker.css";

function formatOdds(n) {
  if (n == null) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export default function GamePicker({ game, isLocked, onToggle }) {
  const [expanded, setExpanded] = useState(false);

  const homeLocked = isLocked(`${game.id}-home`);
  const awayLocked = isLocked(`${game.id}-away`);

  function toggleTeam(side) {
    const id = `${game.id}-${side}`;
    const otherId = `${game.id}-${side === "home" ? "away" : "home"}`;
    const team = side === "home" ? game.homeTeam : game.awayTeam;
    const otherTeam = side === "home" ? game.awayTeam : game.homeTeam;

    // If the other team is locked, deselect it first
    if (isLocked(otherId)) {
      onToggle({ id: otherId, type: "moneyline", team: otherTeam });
    }
    onToggle({ id, type: "moneyline", team });
  }

  function togglePlayer(player) {
    const id = `${game.id}-player-${player.name}`;
    onToggle({
      id,
      type: "player_prop",
      player: player.name,
      stat: "points",
      direction: "over",
      line: null,
    });
  }

  return (
    <div className="game-card">
      <div className="game-header" onClick={() => setExpanded((e) => !e)}>
        <div className="game-teams">
          <span className="team away">{game.awayTeam}</span>
          <span className="game-at">@</span>
          <span className="team home">{game.homeTeam}</span>
        </div>
        <div className="game-meta">
          <span className="game-time">{formatTime(game.commenceTime)}</span>
          <span className={`expand-icon ${expanded ? "open" : ""}`}>›</span>
        </div>
      </div>

      <div className="team-picks">
        <button
          className={`pick-btn ${awayLocked ? "locked" : ""}`}
          onClick={() => toggleTeam("away")}
        >
          <span className="pick-team">{game.awayTeam.split(" ").pop()}</span>
          <span className="pick-odds">{formatOdds(game.odds?.away)}</span>
          {awayLocked && <span className="lock-icon">✓</span>}
        </button>
        <button
          className={`pick-btn ${homeLocked ? "locked" : ""}`}
          onClick={() => toggleTeam("home")}
        >
          <span className="pick-team">{game.homeTeam.split(" ").pop()}</span>
          <span className="pick-odds">{formatOdds(game.odds?.home)}</span>
          {homeLocked && <span className="lock-icon">✓</span>}
        </button>
      </div>

      {expanded && game.players?.length > 0 && (
        <div className="players-section">
          <div className="players-label">PLAYER PROPS</div>
          <div className="players-grid">
            {game.players.map((player) => {
              const pid = `${game.id}-player-${player.name}`;
              const locked = isLocked(pid);
              return (
                <button
                  key={player.name}
                  className={`player-btn ${locked ? "locked" : ""}`}
                  onClick={() => togglePlayer(player)}
                >
                  {player.name}
                  {locked && <span className="lock-icon">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {expanded && (!game.players || game.players.length === 0) && (
        <div className="players-section">
          <div className="players-label" style={{ color: "var(--text3)" }}>
            No player props available (upgrade Odds API plan)
          </div>
        </div>
      )}

      {game.players?.length > 0 && (
        <button className="expand-players" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Hide players ↑" : `+ ${game.players.length} players`}
        </button>
      )}
    </div>
  );
}