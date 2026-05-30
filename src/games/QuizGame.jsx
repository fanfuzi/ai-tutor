import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function answerMatches(selected, question) {
  if (!selected || !question) return false;
  if (selected === question.answer) return true;
  const options = question.options || [];
  const numIdx = Number(question.answer);
  if (!isNaN(numIdx) && numIdx >= 0 && numIdx < options.length && options[numIdx] === selected) return true;
  if (/^[A-Da-d]$/.test(question.answer)) {
    const letterIdx = question.answer.toUpperCase().charCodeAt(0) - 65;
    if (letterIdx >= 0 && letterIdx < options.length && options[letterIdx] === selected) return true;
  }
  const stripPrefix = (s) => ('' + s).replace(/^[A-Da-d][.、)\s]*/, '').trim();
  const cleanSelected = stripPrefix(selected);
  const cleanAnswer = stripPrefix(question.answer);
  if (cleanSelected === cleanAnswer) return true;
  for (let i = 0; i < options.length; i++) {
    if (stripPrefix(options[i]) === cleanSelected && stripPrefix(options[i]) === cleanAnswer) return true;
    const optLetter = String.fromCharCode(65 + i);
    if (question.answer.toUpperCase() === optLetter && stripPrefix(options[i]) === cleanSelected) return true;
  }
  return false;
}

export default function QuizGame({ questions, onComplete, title, showStory = true, onAnswer }) {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [showStoryText, setShowStoryText] = useState(true);
  const feedbackTimer = useRef(null);

  const question = questions[current];

  const shuffledOptions = useMemo(() => {
    if (!question?.options) return [];
    return shuffleArray(question.options);
  }, [question]);

  const handleSelect = useCallback((option) => {
    if (selected !== null) return;
    setSelected(option);
    const isCorrect = answerMatches(option, question);
    if (isCorrect) setScore(s => s + 1);
    onAnswer?.(isCorrect, question);
    setTimeout(() => {
      if (current < questions.length - 1) {
        setCurrent(c => c + 1);
        setSelected(null);
        setShowStoryText(true);
      } else {
        setFinished(true);
        onComplete?.(score + (isCorrect ? 1 : 0), questions.length);
      }
    }, 1200);
  }, [selected, question, current, questions.length, onComplete, score, onAnswer]);

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    const stars = pct >= 90 ? '🌟🌟🌟' : pct >= 70 ? '🌟🌟' : '🌟';
    const msg = pct >= 80 ? '太厉害了！你是小天才！🎉' : pct >= 50 ? '很不错哦！继续加油！💪' : '没关系，多练几次就会了！🤗';
    return (
      <div className="quiz-result">
        <div className="quiz-result-stars">{stars}</div>
        <div className="quiz-result-score">{score} / {questions.length}</div>
        <div className="quiz-result-msg">{msg}</div>
      </div>
    );
  }

  if (!question) return <div className="quiz-empty">暂无题目</div>;

  return (
    <div className="quiz-game">
      {title && <h3 className="game-title">{title}</h3>}
      <div className="quiz-counter">第 {current + 1} / {questions.length} 题</div>
      {showStory && question.story && (
        <div className="quiz-story" onClick={() => setShowStoryText(false)}>
          {showStoryText && <span className="story-hint">📖 {question.story}</span>}
        </div>
      )}
      <div className="quiz-question">{question.question}</div>
      <div className="quiz-options">
        {shuffledOptions.map((opt, i) => {
          let btnClass = 'quiz-option';
          if (selected === opt) {
            btnClass += answerMatches(opt, question) ? ' correct' : ' wrong';
          } else if (selected !== null && answerMatches(opt, question)) {
            btnClass += ' correct';
          }
          return (
            <button key={i} className={btnClass} onClick={() => handleSelect(opt)} disabled={selected !== null}>
              <span className="option-label">{String.fromCharCode(65 + i)}</span>
              <span className="option-text">{opt}</span>
              {selected === opt && (
                <span className="option-icon">{answerMatches(opt, question) ? '✓' : '✗'}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
