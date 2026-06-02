import "./Header.css";

export default function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="logo">
          <span className="logo-mark">SW</span>
          <span className="logo-text">SwishIt</span>
          <span className="logo-tag">BETA</span>
        </div>
        <p className="header-sub">AI-powered NBA parlay builder</p>
      </div>
    </header>
  );
}
