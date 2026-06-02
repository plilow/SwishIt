import "./BookmakerSelector.css";

const BOOKMAKERS = [
  // US Sportsbooks
  { key: "draftkings",     label: "DraftKings",    region: "us",     type: "book" },
  { key: "fanduel",        label: "FanDuel",        region: "us",     type: "book" },
  { key: "betmgm",         label: "BetMGM",         region: "us",     type: "book" },
  { key: "espnbet",        label: "ESPN Bet",        region: "us2",    type: "book" },
  { key: "betrivers",      label: "BetRivers",      region: "us",     type: "book" },
  { key: "hardrockbet",    label: "Hard Rock Bet",  region: "us2",    type: "book" },
  { key: "betparx",        label: "BetParx",        region: "us2",    type: "book" },
  { key: "ballybet",       label: "Bally Bet",      region: "us2",    type: "book" },
  { key: "fliff",          label: "Fliff",          region: "us2",    type: "book" },
  { key: "bovada",         label: "Bovada",         region: "us",     type: "book" },
  { key: "betonlineag",    label: "BetOnline",      region: "us",     type: "book" },
  { key: "betanysports",   label: "BetAnySports",   region: "us2",    type: "book" },
  { key: "lowvig",         label: "LowVig",         region: "us",     type: "book" },
  { key: "mybookieag",     label: "MyBookie",       region: "us",     type: "book" },
  // DFS Sites
  { key: "prizepicks",     label: "PrizePicks",     region: "us_dfs", type: "dfs" },
  { key: "underdog",       label: "Underdog",       region: "us_dfs", type: "dfs" },
  { key: "pick6",          label: "DK Pick6",       region: "us_dfs", type: "dfs" },
  { key: "betr_us_dfs",    label: "Betr Picks",     region: "us_dfs", type: "dfs" },
];

export default function BookmakerSelector({ value, onChange }) {
  const books = BOOKMAKERS.filter((b) => b.type === "book");
  const dfs   = BOOKMAKERS.filter((b) => b.type === "dfs");

  return (
    <div className="book-wrap">
      <div className="book-group">
        <div className="book-group-label">SPORTSBOOKS</div>
        <div className="book-pills">
          {books.map((b) => (
            <button
              key={b.key}
              className={`book-pill ${value === b.key ? "active" : ""}`}
              onClick={() => onChange(b.key, b.region)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
      <div className="book-group">
        <div className="book-group-label">DFS SITES</div>
        <div className="book-pills">
          {dfs.map((b) => (
            <button
              key={b.key}
              className={`book-pill dfs ${value === b.key ? "active" : ""}`}
              onClick={() => onChange(b.key, b.region)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
