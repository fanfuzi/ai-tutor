import { useEffect, useState } from 'react';

export default function RewardModal({ show, coins = 0, score = 0, total = 0, message = '练习完成！', onClose }) {
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (show) {
      setAnimating(true);
      const t = setTimeout(() => setAnimating(false), 800);
      return () => clearTimeout(t);
    }
  }, [show]);

  if (!show) return null;

  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  return (
    <div className="reward-overlay" onClick={onClose}>
      <div className={`reward-modal ${animating ? 'reward-pop' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="reward-pet">🎉</div>
        <div className="reward-title">{message}</div>
        <div className="reward-score">{score} / {total}</div>
        <div className="reward-bar-track">
          <div className="reward-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        {coins > 0 && (
          <div className="reward-coins">
            <span className="reward-coin-icon">🪙</span>
            <span className="reward-coin-amount">+{coins}</span>
          </div>
        )}
        <button className="btn btn-primary reward-btn" onClick={onClose}>继续</button>
      </div>
    </div>
  );
}
