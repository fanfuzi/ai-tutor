// AI 助教 - Cloudflare Pages Functions
// 部署到 Cloudflare Pages 作为 AI API 代理
//
// 需要设置环境变量：
//   SILICONFLOW_API_KEY=sk-xxx   (推荐) 或 DEEPSEEK_API_KEY=sk-xxx
//
// 部署: wrangler pages deploy dist --branch main

function getAiConfig(env) {
  const sfKey = env.SILICONFLOW_API_KEY || '';
  const dsKey = env.DEEPSEEK_API_KEY || '';
  const apiKey = sfKey || dsKey || '';
  const isSiliconflow = !!sfKey || env.AI_PROVIDER === 'siliconflow';
  return {
    apiKey,
    baseUrl: isSiliconflow ? 'https://api.siliconflow.cn/v1' : 'https://api.deepseek.com/v1',
    model: isSiliconflow
      ? (env.AI_VISION_MODEL || 'Qwen/Qwen3-VL-8B-Instruct')
      : (env.AI_MODEL || 'deepseek-chat'),
  };
}

async function askAI(systemPrompt, userMessage, apiKey, baseUrl, model, maxTokens = 1000) {
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

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content }] }),
  });
  if (!resp.ok) { console.error(`AI API ${resp.status}:`, await resp.text()); return null; }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');
  const method = request.method;
  const config = getAiConfig(env);
  const { apiKey, baseUrl, model } = config;

  if (path === 'health') {
    return json({ status: 'ok', ai: !!apiKey, model });
  }

  try {
    const body = await request.json();

    switch (path) {
      case 'ocr': {
        const { image } = body;
        if (!image) return json({ error: '缺少图片数据' }, 400);
        const text = await askAI('请提取这张图片中的所有文字内容。只输出文字，不要添加说明。', { text: '提取图片中的文字', image, mimeType: 'image/png' }, apiKey, baseUrl, model, 800);
        return json({ text: text || null });
      }

      case 'tutor/classify': {
        const { items, subject, grade } = body;
        if (!items?.length) return json({ error: '缺少上传内容' }, 400);
        const sn = { math: '数学', chinese: '中文', cantonese: '粤语', english: '英文', gs: '常识' }[subject] || subject;
        const itemsText = items.map((item, i) => {
          if (item.text) return `[${i + 1}] 文本：${item.text.slice(0, 300)}`;
          if (item.imageData) return `[${i + 1}] 图片：`;
          return `[${i + 1}] （空）`;
        }).join('\n');
        const userMsgText = `科目：${sn}\n年级：${grade}\n共 ${items.length} 份内容：\n\n${itemsText}\n\n请分析以上内容并自动分类分组。`;
        const hasImages = items.some(i => i.imageData);
        const firstImg = items.find(i => i.imageData);
        const msg = hasImages && firstImg ? { text: userMsgText, image: firstImg.imageData, mimeType: firstImg.mimeType || 'image/png' } : userMsgText;
        const systemPrompt = `你是香港一位资深${sn}教师，分析学生的学习材料并分类。输出严格JSON：{"groups":[{"id":"G1","type":"homework|exam|textbook|mistakes|concept","label":"组名","itemIndices":[0,1],"topics":["知识点"],"difficulty":"基础|中等|偏难","summary":""}],"overallAnalysis":{"weakTopics":[],"difficulty":"","suggestion":""}}`;
        const reply = await askAI(systemPrompt, msg, apiKey, baseUrl, model, 1200);
        if (!reply) return json({ groups: null, error: 'AI 无响应' });
        const jm = reply.match(/\{[\s\S]*\}/);
        return json(jm ? JSON.parse(jm[0]) : { groups: null, error: 'AI 返回格式异常' });
      }

      case 'tutor/generate-exam': {
        const { subject, grade, groups, weakTopics, masteryData, count = 10 } = body;
        if (!groups?.length) return json({ error: '缺少分组内容' }, 400);
        const sn = { math: '数学', chinese: '中文', cantonese: '粤语', english: '英文', gs: '常识' }[subject] || subject;
        const groupsText = groups.map((g, i) => {
          const content = g.items?.map(item => item.text || '（图片）').join('；') || g.summary || '';
          return `分组${i + 1}：${g.label}（${g.type}，${g.difficulty}）\n涉及：${(g.topics || []).join('、')}\n内容摘要：${content.slice(0, 500)}`;
        }).join('\n\n');
        const allFocus = [...new Set([...(weakTopics || []), ...(masteryData || []).filter(m => m.level < 0.6).map(m => m.topic)])];
        const userMsgText = `科目：${sn}\n年级：${grade}\n分组：\n${groupsText}\n\n薄弱：${allFocus.join('、') || '暂无'}\n出${count}道题。`;
        const allItems = groups.flatMap(g => g.items || []).filter(Boolean);
        const firstImg = allItems.find(item => item.imageData);
        const msg = firstImg ? { text: userMsgText, image: firstImg.imageData, mimeType: firstImg.mimeType || 'image/png' } : userMsgText;
        const systemPrompt = `你是香港${sn}教师。输出严格JSON：{"examTitle":"试卷","questions":[{"id":"EX-1","question":"","answer":"正确答案的文字（不要用ABCD字母）","options":["","","",""],"category":"","difficulty":1,"hint":""}]}`;
        const reply = await askAI(systemPrompt, msg, apiKey, baseUrl, model, 2000);
        if (!reply) return json({ questions: null });
        const jm = reply.match(/\{[\s\S]*\}/);
        return json(jm ? JSON.parse(jm[0]) : { questions: null });
      }

      case 'tutor/homework-diagnose': {
        const { textContent, imageData, mimeType, subject, grade } = body;
        if (!textContent && !imageData) return json({ error: '缺少内容' }, 400);
        const sn = { math: '数学', chinese: '汉字', cantonese: '粤语', english: '英文', gs: '常识' }[subject] || subject;
        const u = `年级：${grade}\n内容：${textContent || '（见图片）'}`;
        const msg = imageData ? { text: u, image: imageData, mimeType: mimeType || 'image/png' } : u;
        const reply = await askAI(`你是香港${sn}教师。输出诊断JSON：{"errorCount":0,"errorTypes":[],"firstMessage":"","guidanceSteps":[]}`, msg, apiKey, baseUrl, model, 1200);
        if (!reply) return json(null);
        const jm = reply.match(/\{[\s\S]*\}/);
        return json(jm ? JSON.parse(jm[0]) : null);
      }

      default:
        return json({ error: 'Unknown endpoint' }, 404);
    }
  } catch (e) {
    console.error('API error:', e.message);
    return json({ error: e.message }, 500);
  }
}
