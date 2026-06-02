import "./ParlaySlip.css";

function formatOdds(n) {
  if (n == null) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

export default function ParlaySlip({ parlay, generating }) {
  if (generating) {
    return (
      <div className="slip slip-loading">
        <div className="slip-pulse">
          <div className="pulse-line" style={{ width: "60%" }} />
          <div className="pulse-line" style={{ width: "80%" }} />
          <div className="pulse-line" style={{ width: "50%" }} />
          <div className="pulse-line" style={{ width: "70%" }} />
          <div className="pulse-line" style={{ width: "40%" }} />
        </div>
        <div className="slip-loading-text">AI is building your parlay...</div>
      </div>
    );
  }

  if (!parlay) {
    return (
      <div className="slip slip-empty">
        <div className="slip-empty-icon">◈</div>
        <div className="slip-empty-title">Your parlay will appear here</div>
        <div className="slip-empty-sub">
          Set your multiplier, optionally lock picks, then hit generate.
        </div>
      </div>
    );
  }

  return (
    <div className="slip slip-result">
      {/* Header */}
      <div className="slip-header">
        <div className="slip-title-row">
          <span className="slip-title">Parlay Slip</span>
          <span className="slip-multiplier">{parlay.approx_multiplier}</span>
        </div>
        <div className="slip-combined">
          <span className="slip-odds-label">Combined odds</span>
          <span className="slip-odds-value">{parlay.combined_odds}</span>
        </div>
      </div>

      {/* Legs */}
      <div className="slip-legs">
        {parlay.legs.map((leg, i) => (
          <div key={i} className="slip-leg">
            <div className="leg-number">{i + 1}</div>
            <div className="leg-body">
              <div className="leg-pick">{leg.pick}</div>
              <div className="leg-reasoning">{leg.reasoning}</div>
            </div>
            <div className={`leg-odds ${leg.odds > 0 ? "pos" : "neg"}`}>
              {formatOdds(leg.odds)}
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="slip-summary">
        <div className="summary-label">AI ANALYSIS</div>
        <p className="summary-text">{parlay.summary}</p>
      </div>

      {/* Disclaimer */}
      <div className="slip-disclaimer">
        For entertainment purposes only. Not financial advice. Please gamble responsibly.
      </div>
    </div>
  );
}
