import { useState } from 'react';

const PET_EMOJIS = { cat: '🐱', dog: '🐶', rabbit: '🐰', hamster: '🐹', fox: '🦊', panda: '🐼' };

export default function PetCompanion({ size = 'medium', mood = 'normal', statusText, interactive = false, celebrating = false }) {
  const [bubble, setBubble] = useState(null);
  const petSize = size === 'large' ? 100 : size === 'small' ? 50 : 70;

  const colors = {
    normal: { body: '#FFB5C2', ear: '#FF9EAA' },
    happy: { body: '#FF9EAA', ear: '#FF8585' },
    sad: { body: '#B8D4E8', ear: '#A0C4D8' },
    hungry: { body: '#E8D4B8', ear: '#D4C0A0' },
  };
  const c = colors[mood] || colors.normal;

  const moodMessages = {
    hungry: '有点饿了…',
    sad: '想要你陪陪我…',
    happy: '今天好开心！',
    normal: '我在这里等你~',
  };
  const message = statusText || moodMessages[mood] || '我在这里等你~';

  function handleTap() {
    if (!interactive) return;
    const texts = ['嘿嘿！', '好痒～', '嘻嘻！', '再来一下！'];
    const text = texts[Math.floor(Math.random() * texts.length)];
    setBubble(text);
    setTimeout(() => setBubble(null), 2000);
  }

  return (
    <div className={`pet-companion pet-${size} ${interactive ? 'pet-interactive' : ''}`}
      onClick={handleTap} style={{ cursor: interactive ? 'pointer' : 'default' }}>
      <div className="pet-sprite-wrap" style={{ position: 'relative' }}>
        <svg width={petSize} height={petSize * 1.3} viewBox="0 0 120 160"
          className={celebrating ? 'pet-celebrating' : ''}>
          {celebrating && (
            <g>
              {[0,1,2,3,4,5].map(i => (
                <text key={i} x={20 + Math.sin(i*1.2)*45+60} y={15+Math.cos(i*1.2)*20} fontSize="10">✨</text>
              ))}
            </g>
          )}
          <ellipse cx="60" cy="48" rx="36" ry="32" fill={c.body} />
          <ellipse cx="40" cy="42" rx="8" ry="8" fill="white" />
          <ellipse cx="80" cy="42" rx="8" ry="8" fill="white" />
          <circle cx="40" cy="42" r="3.5" fill="#4A3A3A" />
          <circle cx="80" cy="42" r="3.5" fill="#4A3A3A" />
          <path d={mood === 'sad' ? 'M52,60 Q60,56 68,60' : 'M50,56 Q60,66 70,56'} fill="none" stroke="#4A3A3A" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="60" cy="48" rx="4" ry="3" fill="#FF8C9E" />
        </svg>
        {bubble && <div className="pet-bubble"><span className="pet-bubble-text">{bubble}</span></div>}
      </div>
      <div className="pet-info">
        <div className="pet-mood-text">{message}</div>
      </div>
    </div>
  );
}
