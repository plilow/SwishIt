import "./GenerateButton.css";

export default function GenerateButton({ onClick, loading, multiplier, lockedCount }) {
  return (
    <button className={`gen-btn ${loading ? "loading" : ""}`} onClick={onClick} disabled={loading}>
      {loading ? (
        <span className="gen-inner">
          <span className="spinner" />
          Generating parlay...
        </span>
      ) : (
        <span className="gen-inner">
          <span className="gen-label">Generate {multiplier}x Parlay</span>
          {lockedCount > 0 && (
            <span className="gen-meta">with {lockedCount} locked pick{lockedCount > 1 ? "s" : ""}</span>
          )}
          <span className="gen-arrow">→</span>
        </span>
      )}
    </button>
  );
}
