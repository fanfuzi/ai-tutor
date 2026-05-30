import { useState, useRef, useEffect } from 'react';
import { useGame, getPetEmoji } from '../store';
import { classifyContent, generateExam, ocrImage } from '../api';
import QuizGame from '../games/QuizGame';
import PetCompanion from '../components/PetCompanion';
import RewardModal from '../components/RewardModal';

const SUBJECTS = [
  { id: 'math', label: '数学', icon: '🔢', color: '#FF9EAA' },
  { id: 'chinese', label: '中文', icon: '✍️', color: '#A8D8EA' },
  { id: 'english', label: '英文', icon: '🔤', color: '#FFB5C2' },
  { id: 'gs', label: '常识', icon: '🌍', color: '#C9B1FF' },
  { id: 'cantonese', label: '粤语', icon: '🗣️', color: '#FFDAA3' },
];

const TYPE_LABELS = {
  homework: { label: '作业', icon: '📝', color: '#FF9EAA' },
  exam: { label: '试卷', icon: '📋', color: '#C9B1FF' },
  textbook: { label: '教材', icon: '📖', color: '#A8D8EA' },
  mistakes: { label: '错题', icon: '❌', color: '#FF8C42' },
  concept: { label: '概念', icon: '💡', color: '#AAE1C6' },
};

export default function AITutorScreen() {
  const { state, dispatch } = useGame();
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const [step, setStep] = useState('start');
  const [subject, setSubject] = useState('math');
  const [petMood, setPetMood] = useState('normal');
  const [petStatus, setPetStatus] = useState('');
  const [items, setItems] = useState([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [overallAnalysis, setOverallAnalysis] = useState(null);
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [examQuestions, setExamQuestions] = useState(null);
  const [examTitle, setExamTitle] = useState('');
  const [textInput, setTextInput] = useState('');
  const [currentArchiveId, setCurrentArchiveId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showReward, setShowReward] = useState(false);
  const [rewardCoins, setRewardCoins] = useState(0);
  const [playerScore, setPlayerScore] = useState(0);
  const [playerTotal, setPlayerTotal] = useState(0);

  const subjectInfo = SUBJECTS.find(s => s.id === subject) || SUBJECTS[0];
  const grade = state.userGrade || 'p3';

  async function compressImage(file, maxDim = 1024) {
    const dataUrl = await fileToBase64(file);
    const img = new Image();
    img.src = dataUrl;
    await new Promise(r => { img.onload = r; });
    let { width, height } = img;
    if (width <= maxDim && height <= maxDim) return { dataUrl };
    if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
    else { width = Math.round(width * (maxDim / height)); height = maxDim; }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL(file.type || 'image/jpeg', 0.85) };
  }

  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function addImageItem(file) {
    if (!file) return;
    setError('');
    try {
      const { dataUrl } = await compressImage(file);
      const base64Data = dataUrl.split(',')[1];
      const newItem = { text: '', imageData: base64Data, mimeType: file.type || 'image/png', preview: dataUrl };
      setOcrLoading(true);
      try {
        const text = await ocrImage(base64Data);
        if (text && text.trim().length >= 10) newItem.text = text.trim();
      } catch { /* ok */ }
      setOcrLoading(false);
      setItems(prev => [...prev, newItem]);
    } catch (e) {
      setError('图片加载失败: ' + e.message);
    }
  }

  function addTextItem(text) {
    if (!text.trim()) return;
    setItems(prev => [...prev, { text: text.trim(), imageData: null, mimeType: null, preview: null }]);
  }

  function removeItem(index) {
    setItems(prev => prev.filter((_, i) => i !== index));
  }

  async function handleClassify() {
    if (items.length === 0) { setError('请先上传内容'); return; }
    setLoading(true); setError(''); setStep('classifying');
    try {
      const result = await classifyContent({
        items: items.map(i => ({ text: i.text || undefined, imageData: i.imageData || undefined, mimeType: i.mimeType || undefined })),
        subject, grade,
      });
      const finalGroups = result?.groups?.length > 0 ? result.groups : [{
        id: 'G1', type: 'homework', label: '上传内容',
        itemIndices: items.map((_, i) => i),
        topics: [], difficulty: '待分析', summary: '全部上传内容',
      }];
      setGroups(finalGroups);
      setOverallAnalysis(result?.overallAnalysis || null);
      setSelectedGroups(new Set(finalGroups.map(g => g.id)));
      setStep('groups');

      // 自动存档
      try {
        const sInfo = SUBJECTS.find(s => s.id === subject) || SUBJECTS[0];
        const firstText = items.find(i => i.text)?.text?.slice(0, 30) || '';
        const title = firstText ? `${sInfo.label} - ${firstText}···` : `${sInfo.label}（${items.length}份）`;
        const weakSnapshot = { mastery: state.mastery[subject] || {}, wrongRecords: (state.wrongRecords[subject] || []).slice(-20) };
        const lightItems = items.map(i => ({ text: i.text || undefined, mimeType: i.mimeType || undefined, hasImage: !!i.imageData }));
        const archivePayload = { subject, grade, title, createdAt: Date.now(), items: lightItems, groups: finalGroups, overallAnalysis: result?.overallAnalysis || null, weakSnapshot, practiced: false };
        dispatch({ type: 'SAVE_UPLOAD_ARCHIVE', payload: archivePayload });
        try {
          const saved = JSON.parse(localStorage.getItem('ai-tutor-data') || '{}');
          if (saved.uploadArchives?.length > 0) setCurrentArchiveId(saved.uploadArchives[0].id);
        } catch {}
      } catch (e) { console.warn('存档失败:', e.message); }
    } catch (e) {
      setError('分析失败: ' + e.message);
      setStep('upload');
    }
    setLoading(false);
  }

  async function handleGenerateExam() {
    const selected = groups.filter(g => selectedGroups.has(g.id));
    if (selected.length === 0) { setError('请至少选择一个分组'); return; }
    setLoading(true); setError(''); setStep('generating');
    const weakTopics = [...new Set((state.wrongRecords[subject] || []).map(r => r.category).filter(Boolean))];
    const masteryData = Object.entries(state.mastery[subject] || {}).map(([topic, data]) => ({ topic, level: data.level, total: data.total }));
    try {
      const selectedGroupsData = selected.map(g => ({
        ...g,
        items: (g.itemIndices || []).map(idx => items[idx]).filter(Boolean).map(i => ({
          text: i.text || undefined, imageData: i.imageData || undefined, mimeType: i.mimeType || undefined,
        })),
      }));
      const result = await generateExam({ subject, grade, groups: selectedGroupsData, weakTopics, masteryData, count: 8 });
      if (result?.questions?.length > 0) {
        setExamQuestions(result.questions);
        setExamTitle(result.examTitle || `${subjectInfo.label}模拟练习`);
        setStep('quiz');
        if (currentArchiveId) dispatch({ type: 'MARK_ARCHIVE_PRACTICED', payload: currentArchiveId });
      } else {
        setError(`AI 出题失败: ${result?.error || 'AI 返回内容无法解析'}`);
        setStep('groups');
      }
    } catch (e) {
      setError('出题失败: ' + e.message);
      setStep('groups');
    }
    setLoading(false);
  }

  function handleComplete(score, total) {
    setPlayerScore(score); setPlayerTotal(total);
    const coins = Math.round((score / total) * 10) + 2;
    setRewardCoins(coins); setShowReward(true);
    dispatch({ type: 'COMPLETE_QUEST', payload: { subject, score: coins, questionsDone: total } });
  }

  function handleAnswer(correct, question) {
    if (correct) { setPetMood('happy'); setPetStatus('答对了！🌟'); setTimeout(() => { setPetMood('normal'); setPetStatus(''); }, 1500); }
    else {
      setPetMood('sad'); setPetStatus('加油！💪');
      setTimeout(() => { setPetMood('normal'); setPetStatus(''); }, 2000);
      if (question?.category) {
        dispatch({ type: 'RECORD_WRONG_ANSWER', payload: { subject, category: question.category, questionId: question.id } });
        dispatch({ type: 'UPDATE_MASTERY', payload: { subject, category: question.category, correct: 0, total: 1 } });
      }
    }
  }

  function handleRewardClose() { setShowReward(false); resetAll(); }

  function resetAll() {
    setStep('start'); setItems([]); setGroups([]); setOverallAnalysis(null);
    setSelectedGroups(new Set()); setExamQuestions(null); setExamTitle(''); setError('');
  }

  // ════ 首页 ════
  if (step === 'start') {
    return (
      <div className="screen">
        <div className="screen-header">
          <h2>🧑‍🏫 AI 助教</h2>
          <div className="header-coins">
            <span>🪙 {state.coins}</span>
            <span>🌟 {state.stars}</span>
          </div>
        </div>
        <div className="tutor-hero">
          <PetCompanion size="small" mood="happy" statusText="上传资料，我帮你智能分析！" interactive />
        </div>
        <div className="tutor-info-bar">
          📚 今日已学 <b>{state.dailyStudyMinutes || 0}</b> 分钟 · Lv.{state.pet.level} {getPetEmoji(state.pet)}
        </div>
        <div className="section-desc"><p>选择科目</p></div>
        <div className="tutor-subject-grid">
          {SUBJECTS.map(s => (
            <button key={s.id} className="tutor-subject-card" style={{ '--card-color': s.color }}
              onClick={() => { setSubject(s.id); setStep('upload'); }}>
              <span className="tutor-subject-icon">{s.icon}</span>
              <span className="tutor-subject-label">{s.label}</span>
            </button>
          ))}
        </div>
        {Object.entries(state.mastery).some(([, m]) => Object.keys(m).length > 0) && (
          <div className="tutor-weakness-overview">
            <div className="tutor-weakness-title">📊 薄弱知识点</div>
            <div className="tutor-weakness-list">
              {Object.entries(state.mastery).map(([subj, topics]) => {
                const weak = Object.entries(topics).filter(([, d]) => d.level < 0.5 && d.total >= 2);
                if (!weak.length) return null;
                const sInfo = SUBJECTS.find(s => s.id === subj);
                return weak.slice(0, 3).map(([topic, data]) => (
                  <span key={`${subj}-${topic}`} className="tutor-weakness-chip" style={{ borderColor: sInfo?.color }}>
                    {sInfo?.icon} {topic} ({Math.round(data.level * 100)}%)
                  </span>
                ));
              })}
            </div>
          </div>
        )}
        {(state.uploadArchives?.length > 0) && (
          <div className="tutor-archives-entry" onClick={() => setStep('archives')}>
            <span className="tutor-archives-entry-icon">📂</span>
            <span className="tutor-archives-entry-text">学习存档（{state.uploadArchives.length}）</span>
            <span className="tutor-archives-entry-arrow">→</span>
          </div>
        )}
      </div>
    );
  }

  // ════ 学习存档 ════
  if (step === 'archives') {
    const sorted = state.uploadArchives || [];
    const SUBJECT_MAP = Object.fromEntries(SUBJECTS.map(s => [s.id, s]));
    function loadArchive(archive) {
      setSubject(archive.subject); setItems(archive.items || []); setGroups(archive.groups || []);
      setOverallAnalysis(archive.overallAnalysis || null);
      setSelectedGroups(new Set((archive.groups || []).map(g => g.id)));
      setCurrentArchiveId(archive.id); setStep('groups');
    }
    return (
      <div className="screen">
        <div className="screen-header"><button className="btn-back" onClick={() => setStep('start')}>← 返回</button><h2>📂 学习存档</h2><div /></div>
        <div className="tutor-content">
          {sorted.length === 0 ? (
            <div className="archive-empty"><p>暂无存档</p><p className="archive-empty-hint">上传内容并完成AI分析后，会自动保存到这里</p></div>
          ) : (
            <div className="archive-list">
              {sorted.map(a => {
                const sInfo = SUBJECT_MAP[a.subject] || SUBJECTS[0];
                const date = new Date(a.createdAt).toLocaleDateString('zh-HK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const itemSummary = a.items?.length > 0 ? (a.items.find(i => i.text)?.text?.slice(0, 40) || (a.items.some(i => i.hasImage) ? `${a.items.length}份图片` : '')) : '';
                const weakTags = (a.weakSnapshot?.mastery ? Object.entries(a.weakSnapshot.mastery).filter(([, d]) => d.level < 0.5 && d.total >= 2).map(([t]) => t) : []).slice(0, 3);
                return (
                  <div key={a.id} className={`archive-card ${a.practiced ? 'archive-practiced' : ''}`}>
                    <div className="archive-card-header">
                      <span className="archive-subject-icon" style={{ color: sInfo.color }}>{sInfo.icon}</span>
                      <span className="archive-grade">{a.grade?.toUpperCase()}</span>
                      <span className="archive-date">{date}</span>
                      {a.practiced && <span className="archive-practiced-badge">✅已练</span>}
                    </div>
                    <div className="archive-title">{a.title}</div>
                    {itemSummary && <div className="archive-summary">{itemSummary}</div>}
                    {weakTags.length > 0 && (
                      <div className="archive-weak-tags">{weakTags.map(t => <span key={t} className="group-topic-tag">⚠️ {t}</span>)}</div>
                    )}
                    <div className="archive-actions">
                      <button className="btn btn-primary btn-small" onClick={() => loadArchive(a)}>📝 重新出题</button>
                      <button className="btn btn-small btn-secondary" onClick={() => { if (confirm('确定删除？')) dispatch({ type: 'DELETE_UPLOAD_ARCHIVE', payload: a.id }); }}>🗑️ 删除</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ════ 上传页 ════
  if (step === 'upload') {
    return (
      <div className="screen">
        <div className="screen-header">
          <button className="btn-back" onClick={() => { setItems([]); setStep('start'); }}>← 返回</button>
          <h2>{subjectInfo.icon} 上传资料</h2><div />
        </div>
        <div className="tutor-content">
          <p className="upload-hint-text">上传作业、试卷、教材或错题（可多次上传），AI 会自动分类分析</p>
          {items.length > 0 && (
            <div className="upload-items-list">
              {items.map((item, i) => (
                <div key={i} className="upload-item-card">
                  {item.preview ? <img src={item.preview} alt="" className="upload-item-thumb" /> : <div className="upload-item-text-preview">{item.text?.slice(0, 60)}...</div>}
                  <button className="upload-item-remove" onClick={() => removeItem(i)}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div className="upload-actions">
            <button className="upload-action-btn upload-camera" onClick={() => cameraRef.current?.click()}>
              <span className="upload-action-icon">📷</span>
              <span className="upload-action-label">拍照</span>
            </button>
            <button className="upload-action-btn upload-gallery" onClick={() => galleryRef.current?.click()}>
              <span className="upload-action-icon">🖼️</span>
              <span className="upload-action-label">相册</span>
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) addImageItem(f); e.target.value = ''; }} />
            <input ref={galleryRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { [...(e.target.files || [])].forEach(f => addImageItem(f)); e.target.value = ''; }} />
          </div>
          {ocrLoading && <div className="upload-ocr-status"><span>识别中...</span></div>}
          <div className="tutor-divider"><span>或粘贴文本内容</span></div>
          <div className="upload-text-row">
            <textarea className="review-textarea" rows={3} placeholder={`粘贴${subjectInfo.label}题目或课本内容...`}
              value={textInput} onChange={e => setTextInput(e.target.value)} />
            <button className="btn btn-small btn-primary" disabled={!textInput.trim()} onClick={() => { addTextItem(textInput); setTextInput(''); }}>添加</button>
          </div>
          {error && <div className="tutor-error">{error}</div>}
          <div className="upload-submit-area">
            {items.length > 0 && (
              <button className="btn btn-primary tutor-submit-btn" onClick={handleClassify} disabled={loading}>
                {loading ? '🔍 分析中...' : `🤖 AI 智能分析（${items.length}份）`}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ════ 分析中 ════
  if (step === 'classifying') {
    return (
      <div className="screen">
        <div className="screen-header"><h2>🔍 AI 分析中</h2><div /></div>
        <div className="analyzing-screen">
          <div className="analyzing-animation">
            <PetCompanion size="medium" mood="happy" statusText="正在智能分析..." interactive />
          </div>
          <div className="analyzing-steps">
            <div className="analyzing-step active">📖 读取 {items.length} 份内容...</div>
            <div className="analyzing-step">🏷️ 自动分类识别...</div>
            <div className="analyzing-step">📊 分析知识点和难度...</div>
            <div className="analyzing-step">📝 生成学习建议...</div>
          </div>
        </div>
      </div>
    );
  }

  // ════ 分组结果 ════
  if (step === 'groups') {
    return (
      <div className="screen">
        <div className="screen-header">
          <button className="btn-back" onClick={() => setStep('upload')}>← 返回</button>
          <h2>📊 AI 分析结果</h2><div />
        </div>
        <div className="tutor-content">
          {overallAnalysis && (
            <div className="groups-overall">
              <div className="groups-overall-title">📋 整体分析</div>
              {overallAnalysis.difficulty && <p className="groups-overall-row">难度：{overallAnalysis.difficulty}</p>}
              {overallAnalysis.weakTopics?.length > 0 && (
                <div className="groups-overall-row">
                  薄弱点：{overallAnalysis.weakTopics.map(t => <span key={t} className="result-weak-tag">{t}</span>)}
                </div>
              )}
              {overallAnalysis.suggestion && <p className="groups-overall-suggestion">💡 {overallAnalysis.suggestion}</p>}
            </div>
          )}
          <div className="groups-list">
            <div className="groups-list-title">AI 自动分为 {groups.length} 组，选择要练习的内容：</div>
            {groups.map(g => {
              const typeInfo = TYPE_LABELS[g.type] || TYPE_LABELS.homework;
              const isSelected = selectedGroups.has(g.id);
              return (
                <button key={g.id} className={`group-card ${isSelected ? 'group-selected' : ''}`}
                  onClick={() => { const next = new Set(selectedGroups); isSelected ? next.delete(g.id) : next.add(g.id); setSelectedGroups(next); }}>
                  <div className="group-card-header">
                    <span className="group-type-badge" style={{ background: typeInfo.color + '22', color: typeInfo.color }}>{typeInfo.icon} {typeInfo.label}</span>
                    <span className="group-difficulty">{g.difficulty || ''}</span>
                    <span className="group-check">{isSelected ? '✅' : '⬜'}</span>
                  </div>
                  <div className="group-label">{g.label}</div>
                  {g.topics?.length > 0 && <div className="group-topics">{g.topics.map(t => <span key={t} className="group-topic-tag">{t}</span>)}</div>}
                  {g.summary && <div className="group-summary">{g.summary}</div>}
                </button>
              );
            })}
          </div>
          {error && <div className="tutor-error">{error}</div>}
          <button className="btn btn-primary tutor-submit-btn" onClick={handleGenerateExam} disabled={selectedGroups.size === 0 || loading}>
            {loading ? '📝 生成中...' : `📝 生成练习题（${selectedGroups.size}组）`}
          </button>
        </div>
      </div>
    );
  }

  // ════ 生成中 ════
  if (step === 'generating') {
    return (
      <div className="screen">
        <div className="screen-header"><h2>📝 正在出题</h2><div /></div>
        <div className="analyzing-screen">
          <div className="analyzing-animation">
            <PetCompanion size="medium" mood="happy" statusText="正在出题..." interactive />
          </div>
          <p className="analyzing-hint">AI 正在根据选中的 {selectedGroups.size} 个分组生成针对性练习...</p>
        </div>
      </div>
    );
  }

  // ════ 答题 ════
  if (step === 'quiz' && examQuestions) {
    return (
      <div className="screen">
        <div className="screen-header">
          <button className="btn-back" onClick={() => setStep('groups')}>← 返回</button>
          <h2>📝 {examTitle}</h2><div />
        </div>
        <PetCompanion size="small" mood={petMood} statusText={petStatus} interactive />
        <QuizGame questions={examQuestions} onComplete={handleComplete} onAnswer={handleAnswer} title={examTitle} showStory />
        <RewardModal show={showReward} coins={rewardCoins} score={playerScore} total={playerTotal} message="练习完成！" onClose={handleRewardClose} />
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="screen-header"><h2>🧑‍🏫 AI 助教</h2><div /></div>
      <button className="btn btn-primary" onClick={resetAll}>重新开始</button>
    </div>
  );
}
