import { createContext, useContext, useReducer, useEffect } from 'react';

const STORAGE_KEY = 'ai-tutor-data';

const GRADE_CONFIG = [
  { id: 'p1', label: '小一' },
  { id: 'p2', label: '小二' },
  { id: 'p3', label: '小三' },
  { id: 'p4', label: '小四' },
  { id: 'p5', label: '小五' },
  { id: 'p6', label: '小六' },
  { id: 'f1', label: '中一' },
  { id: 'f2', label: '中二' },
  { id: 'f3', label: '中三' },
];

const initialState = {
  userGrade: 'p3',
  pet: { type: 'cat', name: '小助教', color: '#FFB5C2', accessories: [], exp: 0, level: 1 },
  coins: 10,
  stars: 0,
  mastery: { math: {}, chinese: {}, cantonese: {}, english: {}, gs: {} },
  wrongRecords: { math: [], chinese: [], cantonese: [], english: [], gs: [] },
  uploadArchives: [],
  dailyStudyMinutes: 0,
  lastActive: Date.now(),
  showTutorial: true,
  studySessionMinutes: 25,
  playSessionMinutes: 10,
};

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const merged = { ...initialState, ...parsed };
      // 每日重置
      const today = new Date().toDateString();
      const savedDate = parsed._date;
      if (savedDate !== today) {
        merged.dailyStudyMinutes = 0;
        merged._date = today;
      }
      return merged;
    }
  } catch (e) {
    console.warn('Load state error:', e);
  }
  return { ...initialState, _date: new Date().toDateString() };
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, _date: new Date().toDateString() }));
  } catch (e) {
    console.warn('Save error:', e);
  }
}

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_GRADE':
      return { ...state, userGrade: action.payload };

    case 'SET_PET':
      return { ...state, pet: { ...state.pet, ...action.payload } };

    case 'DISMISS_TUTORIAL':
      return { ...state, showTutorial: false };

    case 'ADD_COINS':
      return { ...state, coins: Math.max(0, (state.coins || 0) + action.payload) };

    case 'COMPLETE_QUEST': {
      const { subject, score, questionsDone } = action.payload;
      const today = new Date().toDateString();
      const expGain = questionsDone * 5 + (score > 70 ? 10 : 0);
      const newExp = state.pet.exp + expGain;
      const newLevel = Math.floor(newExp / 100) + 1;
      // 每5道题=1分钟学习
      const studyGain = Math.max(1, Math.round(questionsDone * 0.5));
      const newDailyStudy = (state.dailyStudyMinutes || 0) + studyGain;
      // 金币奖励
      const newCoins = (state.coins || 0) + score;
      const starGain = Math.floor(score / 10);
      const newStars = (state.stars || 0) + starGain;
      return {
        ...state,
        coins: newCoins,
        stars: newStars,
        pet: { ...state.pet, exp: newExp, level: newLevel },
        dailyStudyMinutes: newDailyStudy,
        lastActive: Date.now(),
      };
    }

    case 'RECORD_WRONG_ANSWER': {
      const { subject, category, questionId } = action.payload;
      const records = state.wrongRecords[subject] || [];
      if (records.some(r => r.questionId === questionId)) return state;
      return {
        ...state,
        wrongRecords: {
          ...state.wrongRecords,
          [subject]: [...records, { category, questionId, timestamp: Date.now() }],
        },
      };
    }

    case 'UPDATE_MASTERY': {
      const { subject, category, correct, total } = action.payload;
      const subMastery = { ...(state.mastery[subject] || {}) };
      const old = subMastery[category] || { level: 0, correct: 0, total: 0, lastReview: 0 };
      const newTotal = old.total + total;
      const newCorrect = old.correct + correct;
      subMastery[category] = { level: newTotal > 0 ? newCorrect / newTotal : 0, correct: newCorrect, total: newTotal, lastReview: Date.now() };
      return { ...state, mastery: { ...state.mastery, [subject]: subMastery } };
    }

    case 'SAVE_UPLOAD_ARCHIVE': {
      const archive = { ...action.payload, id: Date.now() + '-' + Math.random().toString(36).slice(2, 6) };
      return { ...state, uploadArchives: [archive, ...(state.uploadArchives || [])].slice(0, 20) };
    }

    case 'DELETE_UPLOAD_ARCHIVE': {
      return { ...state, uploadArchives: (state.uploadArchives || []).filter(a => a.id !== action.payload) };
    }

    case 'MARK_ARCHIVE_PRACTICED': {
      return {
        ...state,
        uploadArchives: (state.uploadArchives || []).map(a =>
          a.id === action.payload ? { ...a, practiced: true } : a
        ),
      };
    }

    case 'UPDATE_PET_PLAY_SETTINGS': {
      return {
        ...state,
        ...(action.payload.studySessionMinutes !== undefined && { studySessionMinutes: action.payload.studySessionMinutes }),
        ...(action.payload.playSessionMinutes !== undefined && { playSessionMinutes: action.payload.playSessionMinutes }),
      };
    }

    default:
      return state;
  }
}

const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, null, loadState);

  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}

export function getPetEmoji(pet) {
  const emojis = { cat: '🐱', dog: '🐶', rabbit: '🐰', hamster: '🐹', fox: '🦊', panda: '🐼' };
  return emojis[pet?.type] || '🐱';
}

export function getPetMood(state) {
  const p = state.pet;
  if (p.hunger < 30) return 'hungry';
  if (p.happiness < 30) return 'sad';
  return 'normal';
}

export function getGradeLabel(id) {
  return GRADE_CONFIG.find(g => g.id === id)?.label || id;
}

export { GRADE_CONFIG };
