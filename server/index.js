// AI 助教 - 后端代理服务
// 用于本地开发：代理 AI API 请求到 SiliconFlow / Deepseek
//
// 启动方式：AI_PROVIDER=siliconflow SILICONFLOW_API_KEY=sk-xxx node server/index.js
// 访问：http://localhost:3001

import express from 'express';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '10mb' }));

// ===== AI 提供商配置 =====
function getAiConfig() {
  const sfKey = process.env.SILICONFLOW_API_KEY || '';
  const apiKey = sfKey || process.env.DEEPSEEK_API_KEY || '';
  const provider = process.env.AI_PROVIDER || (sfKey ? 'siliconflow' : 'deepseek');
  const isSiliconflow = provider === 'siliconflow' || !!sfKey;

  return {
    apiKey,
    baseUrl: isSiliconflow ? 'https://api.siliconflow.cn/v1' : 'https://api.deepseek.com/v1',
    model: process.env.AI_VISION_MODEL || (isSiliconflow ? 'Qwen/Qwen3-VL-8B-Instruct' : 'deepseek-chat'),
    isSiliconflow,
  };
}

async function askAI(systemPrompt, userMessage, maxTokens = 1000) {
  const config = getAiConfig();
  if (!config.apiKey) return null;

  const hasImage = typeof userMessage === 'object' && userMessage !== null && userMessage.image;
  let content;
  if (hasImage) {
    const mime = userMessage.mimeType || 'image/png';
    content = [
      { type: 'text', text: userMessage.text || '' },
      { type: 'image_url', image_url: { url: `data:${mime};base64,${userMessage.image}` } },
    ];
  } else {
    content = typeof userMessage === 'string' ? userMessage : (userMessage?.text || JSON.stringify(userMessage));
  }

  const resp = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`AI API ${resp.status}: ${err}`);
    return null;
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || null;
}

// ===== 健康检查 =====
app.get('/api/health', (req, res) => {
  const config = getAiConfig();
  res.json({ status: 'ok', ai: !!config.apiKey, provider: config.isSiliconflow ? 'siliconflow' : 'deepseek', model: config.model });
});

// ===== OCR =====
app.post('/api/ocr', async (req, res) => {
  const { image } = req.body;
  if (!image) return res.status(400).json({ error: '缺少图片数据' });
  const text = await askAI('请提取这张图片中的所有文字内容。只输出文字，不要添加说明。', { text: '提取图片中的文字', image, mimeType: 'image/png' }, 800);
  res.json({ text: text || null });
});

// ===== AI 内容分类 =====
app.post('/api/tutor/classify', async (req, res) => {
  const { items, subject, grade } = req.body;
  if (!items?.length) return res.json({ error: '缺少上传内容' });

  const sn = { math: '数学', chinese: '中文', cantonese: '粤语', english: '英文', gs: '常识' }[subject] || subject;
  const itemsText = items.map((item, i) => {
    if (item.text) return `[${i + 1}] 文本：${item.text.slice(0, 300)}`;
    if (item.imageData) return `[${i + 1}] 图片：`;
    return `[${i + 1}] （空）`;
  }).join('\n');
  const userMsgText = `科目：${sn}\n年级：${grade}\n共 ${items.length} 份内容：\n\n${itemsText}\n\n请分析以上内容并自动分类分组。`;

  const hasImages = items.some(i => i.imageData);
  const firstImg = items.find(i => i.imageData);
  const msg = hasImages && firstImg
    ? { text: userMsgText, image: firstImg.imageData, mimeType: firstImg.mimeType || 'image/png' }
    : userMsgText;

  const systemPrompt = `你是香港一位资深${sn}教师，擅长分析学生的学习材料。将学生上传的学习内容自动分类分组，分析每组的难度和知识点。分类标准："homework"=作业 "exam"=试卷 "textbook"=教材 "mistakes"=错题 "concept"=概念。输出严格JSON：{"groups":[{"id":"G1","type":"homework|exam|textbook|mistakes|concept","label":"组名","itemIndices":[0,1],"topics":["知识点"],"difficulty":"基础|中等|偏难","summary":"一句话总结"}],"overallAnalysis":{"weakTopics":[],"difficulty":"","suggestion":""}}`;

  const reply = await askAI(systemPrompt, msg, 1200);
  if (!reply) return res.json({ groups: null, error: 'AI 无响应' });
  const jm = reply.match(/\{[\s\S]*\}/);
  if (jm) return res.json(JSON.parse(jm[0]));
  res.json({ groups: null, error: 'AI 返回格式异常' });
});

// ===== AI 生成试卷 =====
app.post('/api/tutor/generate-exam', async (req, res) => {
  const { subject, grade, groups, weakTopics, masteryData, count = 10 } = req.body;
  if (!groups?.length) return res.json({ error: '缺少分组内容' });

  const sn = { math: '数学', chinese: '中文', cantonese: '粤语', english: '英文', gs: '常识' }[subject] || subject;
  const groupsText = groups.map((g, i) => {
    const content = g.items?.map(item => item.text || '（图片）').join('；') || g.summary || '';
    return `分组${i + 1}：${g.label}（${g.type}，${g.difficulty}）\n涉及：${(g.topics || []).join('、')}\n内容摘要：${content.slice(0, 500)}`;
  }).join('\n\n');
  const allFocus = [...new Set([...(weakTopics || []), ...(masteryData || []).filter(m => m.level < 0.6).map(m => m.topic)])];

  const userMsgText = `科目：${sn}\n年级：${grade}\n选中分组内容：\n${groupsText}\n\n学生薄弱知识点：${allFocus.join('、') || '暂无'}\n请生成 ${count} 道模拟试卷题目。`;

  const allItems = groups.flatMap(g => g.items || []).filter(Boolean);
  const firstImageItem = allItems.find(item => item.imageData);
  const msg = firstImageItem
    ? { text: userMsgText, image: firstImageItem.imageData, mimeType: firstImageItem.mimeType || 'image/png' }
    : userMsgText;

  const systemPrompt = `你是香港一位资深${sn}教师。根据学生的学习情况出针对性的模拟试卷。使用繁体中文，适合${grade}年级。输出严格JSON：{"examTitle":"试卷名称","questions":[{"id":"EX-1","question":"题目","answer":"正确答案的文字（不要用ABCD字母，必须是options数组中的文本）","options":["错误选项1","正确答案","错误选项2","错误选项3"],"category":"知识点","difficulty":1-3,"hint":"提示"}],"summary":{"topics":[],"weakFocus":[],"tip":""}}`;

  const reply = await askAI(systemPrompt, msg, 2000);
  if (!reply) return res.json({ questions: null });
  const jm = reply.match(/\{[\s\S]*\}/);
  if (jm) return res.json(JSON.parse(jm[0]));
  res.json({ questions: null });
});

// ===== 作业诊断 =====
app.post('/api/tutor/homework-diagnose', async (req, res) => {
  const { textContent, imageData, mimeType, subject, grade, wrongRecords, masteryData } = req.body;
  if (!textContent && !imageData) return res.json({ error: '缺少作业内容' });

  const sn = { math: '数学', chinese: '汉字', cantonese: '粤语', english: '英文', gs: '常识' }[subject] || subject;
  const userMsgText = `年级：${grade}\n作业内容：${textContent || '（见上传图片）'}\n请分析并输出诊断JSON。`;
  const msg = imageData ? { text: userMsgText, image: imageData, mimeType: mimeType || 'image/png' } : userMsgText;

  const systemPrompt = `你是一位香港${sn}教师。分析学生作业中的错误。输出JSON：{"errorCount":3,"errorTypes":["careless","keyword"],"firstMessage":"提示语","guidanceSteps":[{"type":"","detectiveHint":"","strategy":""}]}`;

  const reply = await askAI(systemPrompt, msg, 1200);
  if (!reply) return res.json(null);
  const jm = reply.match(/\{[\s\S]*\}/);
  res.json(jm ? JSON.parse(jm[0]) : null);
});

// ===== 自适应复习 =====
app.post('/api/tutor/generate-review', async (req, res) => {
  const { subject, grade, textbookContent, imageData, mimeType, wrongTopics, masteryData, count = 5 } = req.body;
  if (!textbookContent && !imageData) return res.json({ error: '缺少课本内容' });

  const sn = { math: '数学', chinese: '汉字', cantonese: '粤语', english: '英文', gs: '常识' }[subject] || subject;
  const allFocus = [...new Set([...(wrongTopics || []), ...(masteryData || []).filter(m => m.level < 0.6).map(m => m.topic)])];
  const userMsgText = `课本内容：${textbookContent || '（见图片）'}\n年级：${grade}\n薄弱点：${allFocus.join('、') || '暂无'}\n出${count}道${sn}复习题。`;
  const msg = imageData ? { text: userMsgText, image: imageData, mimeType: mimeType || 'image/png' } : userMsgText;

  const systemPrompt = `你是香港${sn}教师。根据课本内容出复习题，紧贴薄弱知识点。输出JSON：{"questions":[{"id":"REV-1","question":"","answer":"","options":["","","",""],"category":"","hint":""}]}`;

  const reply = await askAI(systemPrompt, msg, 1500);
  if (!reply) return res.json({ questions: null });
  const jm = reply.match(/\{[\s\S]*\}/);
  res.json(jm ? JSON.parse(jm[0]) : { questions: null });
});

app.listen(PORT, () => {
  const config = getAiConfig();
  console.log(`\n🧑‍🏫 AI 助教服务器`);
  console.log(`   端口: http://localhost:${PORT}`);
  console.log(`   AI: ${config.apiKey ? '已启用' : '未启用（设置 SILICONFLOW_API_KEY）'}`);
});
