const LEVEL_CONFIG = {
  primary: {
    name: "小学",
    vocabSize: "200-400词",
    sentenceRule: "句子简短（每句5-12个词），使用简单句，避免复合从句",
    topicRule: "主题贴近日常生活：家庭、学校、动物、节日、爱好",
    articleLength: "80-120词，3-4个短段落",
  },
  junior: {
    name: "初中",
    vocabSize: "1000-1800词",
    sentenceRule: "句中可含1-2个从句，适当使用被动语态、比较级",
    topicRule: "主题可涉及校园生活、科技、环保、人物故事、文化习俗",
    articleLength: "150-250词，4-5个段落",
  },
  senior: {
    name: "高中",
    vocabSize: "2500-4000词",
    sentenceRule: "可使用复合从句、倒装、虚拟语气等高级语法结构",
    topicRule: "主题可涉及社会热点、科技发展、心理健康、跨文化比较、议论文",
    articleLength: "250-400词，5-6个段落",
  },
};

function buildArticlePrompt(words, level) {
  const config = LEVEL_CONFIG[level] || LEVEL_CONFIG.junior;
  const wordList = words.join(", ");

  const systemPrompt = `你是一位资深的英语教材编写专家，擅长为${config.name}学生编写适合其阅读水平的英语文章。

请根据以下要求，用英语写一篇文章：

【难度要求】
- 目标读者：${config.name}学生
- 词汇量控制：${config.vocabSize}
- 句式要求：${config.sentenceRule}
- 主题要求：${config.topicRule}
- 文章长度：${config.articleLength}

【必须使用的单词】
以下单词必须自然地融入文章中：${wordList}

【输出格式】
请严格按照以下 JSON 格式输出（不要输出任何其他内容）：

{
  "title": "文章标题（英文，简洁有吸引力）",
  "paragraphs": [
    {
      "text": "段落英文原文，必须自然流畅",
      "phrases": [
        {
          "text": "段落中出现的一个重点短语或搭配",
          "chinese": "该短语的中文释义",
          "note": "简短用法说明（1句话，中文）"
        }
      ]
    }
  ],
  "keyWords": ["文章中实际使用的、从输入单词中挑选的核心词汇"]
}

【重要规则】
1. 每个段落标注 2-3 个重点短语（phrases），可以是固定搭配、习语、重要句型
2. phrases 中的 text 必须能在该段落原文中精确找到
3. 必须把输入的单词自然融入文章，如果某个单词实在无法融入可跳过，但 keyWords 中只列出真正用到的
4. 文章必须原创、语言地道、适合学生阅读`;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: `请用以下单词为${config.name}学生创作一篇英语文章：\n${wordList}` },
  ];
}

function buildExercisesPrompt(article, words, level) {
  const config = LEVEL_CONFIG[level] || LEVEL_CONFIG.junior;
  const articleText = article.paragraphs.map((p) => p.text).join("\n");
  const allPhrases = article.paragraphs.flatMap((p) => p.phrases.map((ph) => ph.text));
  const allKeyWords = article.keyWords || words;

  const systemPrompt = `你是一位专业的英语考试命题专家，擅长为${config.name}学生设计各类英语练习题。请基于下面的文章和核心词汇，生成四种题型的练习题。

【题型要求】
1. 选词填空：抽取 8-10 个核心词汇/短语作为空格，给出 12 个选项（含 2-4 个干扰项）
2. 完形填空：每隔 5-8 个词挖一个空，共设 10 个空，每个空 A/B/C/D 四个选项
3. 七选五：选取 5 个完整句子作为空格，生成 7 个选项（含 2 个干扰句），选项用 A-G 编号
4. 阅读理解：4-5 道选择题（A/B/C/D），覆盖主旨大意、细节理解、推理判断、词义猜测

【输出格式】严格按 JSON 输出：
{
  "wordGapFill": {
    "title": "选词填空",
    "instructions": "从方框中选择适当的单词或短语填空。每个词或短语仅使用一次，有两项是多余的。",
    "wordBank": ["选项1", "选项2", ...共12项],
    "passage": "将文章中的目标词替换为 (1) (2) 等编号的短文",
    "answers": {"1": "正确单词", ...}
  },
  "cloze": {
    "title": "完形填空",
    "passage": "包含 (1)(2)...(10) 空格的短文",
    "questions": [{"num": 1, "options": ["A选项", ...], "answer": "A"}, ...]
  },
  "sevenChooseFive": {
    "title": "七选五",
    "instructions": "根据短文内容，从短文后的选项中选出能填入空白处的最佳选项。选项中有两项为多余选项。",
    "passage": "包含 (A)(B)(C)(D)(E) 空格的短文",
    "options": [{"label": "A", "text": "..."}, ...共7项],
    "answers": {"A": "正确label", ...}
  },
  "readingComprehension": {
    "title": "阅读理解",
    "questions": [{"num": 1, "type": "主旨大意", "question": "...", "options": ["A",...], "answer": "A"}, ...]
  }
}

【规则】所有题目基于原文内容；干扰项有迷惑性但不能有两个正确答案；难度适配${config.name}学生；返回纯 JSON`;

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `【文章标题】${article.title}\n【文章正文】\n${articleText}\n【核心词汇】${allKeyWords.join(", ")}\n【重点短语】${allPhrases.join(", ")}\n\n请为以上内容生成四种题型的练习题。`,
    },
  ];
}

export { buildArticlePrompt, buildExercisesPrompt };
