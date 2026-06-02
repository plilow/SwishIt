import "./MultiplierSelector.css";

const OPTIONS = [2, 3, 4, 5, 6, 8, 10];

export default function MultiplierSelector({ value, onChange }) {
  return (
    <div className="multiplier-wrap">
      <div className="multiplier-pills">
        {OPTIONS.map((n) => (
          <button
            key={n}
            className={`multiplier-pill ${value === n ? "active" : ""}`}
            onClick={() => onChange(n)}
          >
            {n}x
          </button>
        ))}
      </div>
      <div className="multiplier-meta">
        <span className="multiplier-odds">
          ~{value === 2 ? "+100" : value === 3 ? "+200" : value === 4 ? "+300" : `+${(value - 1) * 100}`} combined odds target
        </span>
        <span className="multiplier-legs">
          {value <= 3 ? "2–3" : value <= 6 ? "3–5" : "5–7"} legs
        </span>
      </div>
    </div>
  );
}
