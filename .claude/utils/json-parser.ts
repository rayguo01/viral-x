/**
 * 健壮的 JSON 解析工具模块
 * 基于 engine.go 的经验，处理 LLM 输出的各种 JSON 格式问题
 *
 * 核心策略：
 * 1. 使用 XML 标签分隔思维链和 JSON 输出
 * 2. 多层回退的 JSON 提取机制
 * 3. 全角/CJK 字符修复
 * 4. JSON 格式验证
 * 5. 安全回退机制
 */

// 预编译正则表达式（性能优化）
const RE_RESULT_TAG = /<result>([\s\S]*?)<\/result>/i;
const RE_JSON_TAG = /<json>([\s\S]*?)<\/json>/i;
const RE_DECISION_TAG = /<decision>([\s\S]*?)<\/decision>/i;
const RE_REASONING_TAG = /<reasoning>([\s\S]*?)<\/reasoning>/i;
const RE_JSON_FENCE = /```(?:json)?\s*([\s\S]*?)\s*```/;
const RE_JSON_OBJECT = /\{[\s\S]*\}/;
const RE_JSON_ARRAY = /\[[\s\S]*\]/;
const RE_INVISIBLE_RUNES = /[\u200B\u200C\u200D\uFEFF]/g;

/**
 * 移除零宽字符和 BOM，避免肉眼看不见的前缀破坏校验
 */
export function removeInvisibleRunes(s: string): string {
  return s.replace(RE_INVISIBLE_RUNES, '');
}

/**
 * 修复全角字符和 CJK 标点符号
 * 避免 AI 输出全角 JSON 字符导致解析失败
 */
export function fixFullWidthChars(jsonStr: string): string {
  // 替换中文引号
  jsonStr = jsonStr.replace(/\u201c/g, '"'); // "
  jsonStr = jsonStr.replace(/\u201d/g, '"'); // "
  jsonStr = jsonStr.replace(/\u2018/g, "'"); // '
  jsonStr = jsonStr.replace(/\u2019/g, "'"); // '

  // 替换全角括号、冒号、逗号
  jsonStr = jsonStr.replace(/\uff3b/g, '['); // ［ 全角左方括号
  jsonStr = jsonStr.replace(/\uff3d/g, ']'); // ］ 全角右方括号
  jsonStr = jsonStr.replace(/\uff5b/g, '{'); // ｛ 全角左花括号
  jsonStr = jsonStr.replace(/\uff5d/g, '}'); // ｝ 全角右花括号
  jsonStr = jsonStr.replace(/\uff1a/g, ':'); // ： 全角冒号
  jsonStr = jsonStr.replace(/\uff0c/g, ','); // ， 全角逗号

  // 替换 CJK 标点符号
  jsonStr = jsonStr.replace(/\u3010/g, '['); // 【 CJK左方头括号
  jsonStr = jsonStr.replace(/\u3011/g, ']'); // 】 CJK右方头括号
  jsonStr = jsonStr.replace(/\u3014/g, '['); // 〔 CJK左龟壳括号
  jsonStr = jsonStr.replace(/\u3015/g, ']'); // 〕 CJK右龟壳括号
  jsonStr = jsonStr.replace(/\u3001/g, ','); // 、 CJK顿号

  // 替换全角空格为半角空格
  jsonStr = jsonStr.replace(/\u3000/g, ' '); // 全角空格

  return jsonStr;
}

/**
 * 修复 JSON 中的千位分隔符（如 98,000 → 98000）
 * 只处理 JSON 值中的数字，不影响字符串内容
 */
export function fixThousandSeparators(jsonStr: string): string {
  // 匹配 JSON 中的数字值（非字符串内的数字）
  // 模式：冒号后面的数字，或数组中的数字
  // 例如: "count": 98,000 或 [98,000, 12,345]
  return jsonStr.replace(
    /(?<=:\s*|,\s*|\[\s*)(\d{1,3}(?:,\d{3})+)(?=\s*[,\}\]\n])/g,
    (match) => match.replace(/,/g, '')
  );
}

/**
 * 验证 JSON 格式，检测常见错误
 */
export function validateJSONFormat(jsonStr: string): { valid: boolean; error?: string } {
  const trimmed = jsonStr.trim();

  // 检查是否以 { 或 [ 开头
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return {
      valid: false,
      error: `JSON 必须以 { 或 [ 开头，实际: ${trimmed.substring(0, 20)}`
    };
  }

  // 检查是否包含范围符号 ~（LLM 常见错误）
  if (trimmed.includes('~')) {
    return {
      valid: false,
      error: 'JSON 中不可包含范围符号 ~，所有数字必须是精确的单一值'
    };
  }

  return { valid: true };
}

/**
 * 从 XML 标签中提取内容
 */
export function extractFromXmlTag(response: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = response.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * 提取思维链（CoT）
 */
export function extractReasoning(response: string): string {
  // 方法1: 优先尝试提取 <reasoning> 标签内容
  const reasoning = extractFromXmlTag(response, 'reasoning');
  if (reasoning) {
    return reasoning;
  }

  // 方法2: 如果有 <result> 或 <json> 标签，提取标签之前的内容
  const resultIdx = response.indexOf('<result>');
  const jsonIdx = response.indexOf('<json>');
  const tagIdx = resultIdx >= 0 ? (jsonIdx >= 0 ? Math.min(resultIdx, jsonIdx) : resultIdx) : jsonIdx;

  if (tagIdx > 0) {
    return response.substring(0, tagIdx).trim();
  }

  // 方法3: 查找 JSON 开始位置
  const jsonStart = Math.min(
    response.indexOf('{') >= 0 ? response.indexOf('{') : Infinity,
    response.indexOf('[') >= 0 ? response.indexOf('[') : Infinity
  );

  if (jsonStart > 0 && jsonStart !== Infinity) {
    return response.substring(0, jsonStart).trim();
  }

  return '';
}

/**
 * 多层回退的 JSON 提取
 */
export function extractJSON(response: string): string | null {
  // 预清洗：去零宽/BOM、修复全角字符、修复千位分隔符
  let s = removeInvisibleRunes(response);
  s = fixFullWidthChars(s);
  s = fixThousandSeparators(s);
  s = s.trim();

  // 层级1: 尝试从 <result> 标签中提取
  let jsonPart = extractFromXmlTag(s, 'result');
  if (jsonPart) {
    console.log('✓ 使用 <result> 标签提取 JSON');
    jsonPart = fixFullWidthChars(jsonPart);
    jsonPart = fixThousandSeparators(jsonPart);
  }

  // 层级2: 尝试从 <json> 标签中提取
  if (!jsonPart) {
    jsonPart = extractFromXmlTag(s, 'json');
    if (jsonPart) {
      console.log('✓ 使用 <json> 标签提取 JSON');
      jsonPart = fixFullWidthChars(jsonPart);
      jsonPart = fixThousandSeparators(jsonPart);
    }
  }

  // 层级3: 尝试从 <decision> 标签中提取
  if (!jsonPart) {
    jsonPart = extractFromXmlTag(s, 'decision');
    if (jsonPart) {
      console.log('✓ 使用 <decision> 标签提取 JSON');
      jsonPart = fixFullWidthChars(jsonPart);
      jsonPart = fixThousandSeparators(jsonPart);
    }
  }

  // 如果没有 XML 标签，使用全文
  if (!jsonPart) {
    jsonPart = s;
    console.log('⚠️ 未找到 XML 标签，使用全文搜索 JSON');
  }

  // 层级4: 从 ```json 代码块中提取
  const fenceMatch = jsonPart.match(RE_JSON_FENCE);
  if (fenceMatch) {
    let extracted = fenceMatch[1].trim();
    console.log('✓ 从 ```json 代码块提取 JSON');
    extracted = fixFullWidthChars(extracted);
    return fixThousandSeparators(extracted);
  }

  // 层级5: 尝试提取 JSON 对象
  const objectMatch = jsonPart.match(RE_JSON_OBJECT);
  if (objectMatch) {
    let extracted = objectMatch[0];
    console.log('✓ 提取 JSON 对象');
    extracted = fixFullWidthChars(extracted);
    return fixThousandSeparators(extracted);
  }

  // 层级6: 尝试提取 JSON 数组
  const arrayMatch = jsonPart.match(RE_JSON_ARRAY);
  if (arrayMatch) {
    let extracted = arrayMatch[0];
    console.log('✓ 提取 JSON 数组');
    extracted = fixFullWidthChars(extracted);
    return fixThousandSeparators(extracted);
  }

  return null;
}

/**
 * 解析结果类型
 */
export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  reasoning?: string;
  rawOutput?: string;
}

/**
 * 使用正则表达式从 malformed JSON 中提取关键字段
 * 这是 JSON.parse 失败时的回退机制
 */
export function extractContentByRegex(jsonStr: string): any | null {
  try {
    const result: any = {};

    // 提取 versionA/B/C 的内容 - 使用贪婪匹配找到最长的内容
    // 使用 [\s\S] 代替 . + s 标志来匹配包括换行在内的任意字符
    const versionPatterns = [
      { key: 'versionA', regex: /"versionA"\s*:\s*\{[\s\S]*?"content"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/ },
      { key: 'versionB', regex: /"versionB"\s*:\s*\{[\s\S]*?"content"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/ },
      { key: 'versionC', regex: /"versionC"\s*:\s*\{[\s\S]*?"content"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/ }
    ];

    for (const { key, regex } of versionPatterns) {
      const match = jsonStr.match(regex);
      if (match && match[1]) {
        // 提取 title - 使用 [\s\S] 代替 . + s 标志
        const titleRegex = new RegExp(`"${key}"\\s*:\\s*\\{[\\s\\S]*?"title"\\s*:\\s*"((?:[^"\\\\]|\\\\[\\s\\S])*)"`);
        const titleMatch = jsonStr.match(titleRegex);

        result[key] = {
          title: titleMatch ? titleMatch[1] : key,
          content: match[1]
        };
      }
    }

    // 如果找不到任何版本内容，尝试更宽松的匹配
    if (!result.versionA && !result.versionB && !result.versionC) {
      // 尝试匹配 "content": "..." 的内容（可能包含未转义的换行）
      const looseContentMatch = jsonStr.match(/"content"\s*:\s*"([\s\S]*?)(?:"\s*[,\}]|\n\s*"[a-zA-Z])/);
      if (looseContentMatch && looseContentMatch[1] && looseContentMatch[1].length > 50) {
        result.versionC = {
          title: '恢复的内容',
          content: looseContentMatch[1].replace(/\n/g, '\\n')
        };
      }
    }

    // 提取 analysis
    const analysisMatch = jsonStr.match(/"analysis"\s*:\s*\{([^}]+)\}/);
    if (analysisMatch) {
      try {
        result.analysis = JSON.parse(`{${analysisMatch[1]}}`);
      } catch {
        // 手动提取 analysis 的各个字段
        const topicMatch = analysisMatch[1].match(/"topic"\s*:\s*"([^"]*)"/);
        const audienceMatch = analysisMatch[1].match(/"audience"\s*:\s*"([^"]*)"/);
        const toneMatch = analysisMatch[1].match(/"tone"\s*:\s*"([^"]*)"/);

        result.analysis = {
          topic: topicMatch ? topicMatch[1] : '',
          audience: audienceMatch ? audienceMatch[1] : '',
          tone: toneMatch ? toneMatch[1] : ''
        };
      }
    }

    // 提取 evaluation（简化版）
    const totalMatch = jsonStr.match(/"total"\s*:\s*(\d+)/);
    const summaryMatch = jsonStr.match(/"summary"\s*:\s*"([^"]*)"/);
    if (totalMatch || summaryMatch) {
      result.evaluation = {
        curiosity: { score: 0, comment: '' },
        resonance: { score: 0, comment: '' },
        clarity: { score: 0, comment: '' },
        shareability: { score: 0, comment: '' },
        total: totalMatch ? parseInt(totalMatch[1]) : 0,
        summary: summaryMatch ? summaryMatch[1] : '内容已通过回退机制恢复'
      };
    }

    // 提取 suggestions
    const suggestionsMatch = jsonStr.match(/"suggestions"\s*:\s*\[([\s\S]*?)\]/);
    if (suggestionsMatch) {
      const suggestionsStr = suggestionsMatch[1];
      const suggestionItems = suggestionsStr.match(/"([^"]*)"/g);
      if (suggestionItems) {
        result.suggestions = suggestionItems.map(s => s.replace(/^"|"$/g, ''));
      }
    }

    // 确保有最基本的结构
    if (!result.analysis) {
      result.analysis = { topic: '', audience: '', tone: '' };
    }
    if (!result.evaluation) {
      result.evaluation = {
        curiosity: { score: 0, comment: '' },
        resonance: { score: 0, comment: '' },
        clarity: { score: 0, comment: '' },
        shareability: { score: 0, comment: '' },
        total: 0,
        summary: '内容已通过回退机制恢复'
      };
    }
    if (!result.suggestions) {
      result.suggestions = ['内容已通过回退机制恢复，建议重新生成以获取完整评估'];
    }

    // 只有当有至少一个版本内容时才返回结果
    if (result.versionA || result.versionB || result.versionC) {
      console.log(`🔧 正则回退提取: versionA=${!!result.versionA}, versionB=${!!result.versionB}, versionC=${!!result.versionC}`);
      return result;
    }

    return null;
  } catch (e) {
    console.error('正则回退提取失败:', e);
    return null;
  }
}

/**
 * 健壮的 JSON 解析主函数
 * 支持多层回退和错误处理
 */
export function parseRobustJSON<T = any>(
  response: string,
  validator?: (data: any) => { valid: boolean; error?: string }
): ParseResult<T> {
  const reasoning = extractReasoning(response);
  const jsonStr = extractJSON(response);

  if (!jsonStr) {
    return {
      success: false,
      error: 'AI 未输出有效的 JSON 数据',
      reasoning,
      rawOutput: response.substring(0, 500)
    };
  }

  // 格式验证
  const formatValidation = validateJSONFormat(jsonStr);
  if (!formatValidation.valid) {
    return {
      success: false,
      error: formatValidation.error,
      reasoning,
      rawOutput: jsonStr.substring(0, 500)
    };
  }

  // 解析 JSON
  try {
    const data = JSON.parse(jsonStr) as T;

    // 自定义验证器
    if (validator) {
      const validation = validator(data);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          data,
          reasoning
        };
      }
    }

    return {
      success: true,
      data,
      reasoning
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.log(`⚠️ JSON.parse 失败，尝试正则回退提取: ${error}`);

    // 回退：使用正则表达式提取关键字段
    const recoveredData = extractContentByRegex(jsonStr);
    if (recoveredData && recoveredData.versionC?.content) {
      console.log('✓ 正则回退提取成功，恢复了主要内容');

      // 自定义验证器
      if (validator) {
        const validation = validator(recoveredData);
        if (!validation.valid) {
          return {
            success: false,
            error: validation.error,
            data: recoveredData as T,
            reasoning
          };
        }
      }

      return {
        success: true,
        data: recoveredData as T,
        reasoning
      };
    }

    return {
      success: false,
      error: `JSON 解析失败: ${error}`,
      reasoning,
      rawOutput: jsonStr.substring(0, 500)
    };
  }
}

/**
 * 生成带 XML 标签的输出格式说明
 * 用于在 prompt 中指导 LLM 输出格式
 */
export function generateXMLOutputInstructions(jsonSchema: string): string {
  return `
====================
输出格式要求（极其重要）
====================

**必须使用 XML 标签分隔思维过程和 JSON 结果，避免解析错误**

## 格式要求

<reasoning>
你的思维过程分析...
- 简洁分析你的思考过程
- 可以包含任何字符，不影响 JSON 解析
</reasoning>

<result>
${jsonSchema}
</result>

## 注意事项
1. <result> 标签内必须是合法的 JSON 格式
2. 内容中的换行使用 \\n 表示
3. 内容中的双引号使用 \\" 转义
4. 不要在 <result> 标签内添加 markdown 代码块
5. 所有标点符号必须使用英文半角字符（不要使用中文全角标点）
`;
}

/**
 * 为不需要思维链的场景生成简化的输出格式说明
 */
export function generateSimpleOutputInstructions(jsonSchema: string): string {
  return `
====================
输出格式要求（极其重要）
====================

请将输出包裹在 <result> 标签中：

<result>
${jsonSchema}
</result>

## 注意事项
1. <result> 标签内必须是合法的 JSON 格式
2. 内容中的换行使用 \\n 表示
3. 内容中的双引号使用 \\" 转义
4. 不要在 <result> 标签内添加 markdown 代码块
5. 所有标点符号必须使用英文半角字符（不要使用中文全角标点）
`;
}

export default {
  removeInvisibleRunes,
  fixFullWidthChars,
  validateJSONFormat,
  extractFromXmlTag,
  extractReasoning,
  extractJSON,
  extractContentByRegex,
  parseRobustJSON,
  generateXMLOutputInstructions,
  generateSimpleOutputInstructions
};
