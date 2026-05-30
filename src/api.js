const API_BASE = '/api';

// AI 内容自动分类
export async function classifyContent({ items, subject, grade }) {
  try {
    const res = await fetch(`${API_BASE}/tutor/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, subject, grade }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      return { groups: null, error: errBody.error || `服务器错误 ${res.status}` };
    }
    return await res.json();
  } catch (e) {
    return { groups: null, error: e.message };
  }
}

// AI 根据选中分组生成模拟试卷
export async function generateExam({ subject, grade, groups, weakTopics, masteryData, count = 10 }) {
  try {
    const res = await fetch(`${API_BASE}/tutor/generate-exam`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, grade, groups, weakTopics, masteryData, count }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      return { questions: null, error: errBody.error || `服务器错误 ${res.status}` };
    }
    return await res.json();
  } catch (e) {
    return { questions: null, error: e.message };
  }
}

// AI 作业诊断（快速分析）
export async function homeworkDiagnose({ textContent, imageData, mimeType, subject, grade, wrongRecords, masteryData }) {
  try {
    const res = await fetch(`${API_BASE}/tutor/homework-diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ textContent, imageData, mimeType, subject, grade, wrongRecords, masteryData }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// AI 自适应复习
export async function generateReview({ subject, grade, textbookContent, imageData, mimeType, wrongTopics, masteryData, count = 5 }) {
  try {
    const res = await fetch(`${API_BASE}/tutor/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, grade, textbookContent, imageData, mimeType, wrongTopics, masteryData, count }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// 在线 OCR（AI 图片文字提取）
export async function ocrImage(base64Data) {
  try {
    const res = await fetch(`${API_BASE}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Data }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.text || null;
  } catch { return null; }
}
