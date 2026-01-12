/**
 * Prompt Generator - 根据帖子内容生成 AI 图像生成 prompt
 *
 * 使用 Claude CLI 生成适合社交媒体配图的中文 prompt
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

// JSON Schema 定义
const JSON_SCHEMA = `
{
  "prompt": "完整的图像生成描述，1-3句话，中文",
  "style": "风格建议（如：现代简约、活力四射、复古怀旧等）",
  "mood": "氛围描述（如：温暖、冷峻、充满活力等）",
  "elements": ["视觉元素1", "视觉元素2", "视觉元素3"],
  "colorTone": "色调建议（如：暖色调、冷色调、高对比度等）"
}`;

const SYSTEM_PROMPT = `你是一个专业的社交媒体配图描述专家。

根据给定的社交媒体帖子内容，生成一个适合 AI 图像生成的中文描述（prompt）。

要求：
1. 分析帖子的主题、情感和关键元素
2. 创建视觉上引人注目的图像描述
3. 包含风格建议（现代、简约、活力、复古等）
4. 建议合适的色调和氛围
5. 构图适合社交媒体（吸引眼球、引发共鸣）

====================
输出格式要求（极其重要）
====================
你必须严格按照以下 JSON 格式输出，不要输出任何其他内容：

${JSON_SCHEMA}

注意事项：
1. 输出必须是合法的 JSON 格式
2. prompt 字段是最重要的，需要 1-3 句话描述完整的画面
3. 使用中文
4. 不要在 JSON 前后添加任何说明文字
5. 不要使用 markdown 代码块包裹`;

/**
 * 解析并验证 JSON 输出
 */
function parseAndValidateJSON(output: string): any {
  // 尝试提取 JSON（处理可能的 markdown 代码块包裹）
  let jsonStr = output.trim();

  // 移除可能的 markdown 代码块
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // 尝试找到 JSON 对象的开始和结束
  const startIndex = jsonStr.indexOf('{');
  const endIndex = jsonStr.lastIndexOf('}');
  if (startIndex !== -1 && endIndex !== -1) {
    jsonStr = jsonStr.substring(startIndex, endIndex + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // 验证必要字段
    if (!parsed.prompt) {
      throw new Error('缺少 prompt 字段');
    }

    return parsed;
  } catch (e) {
    console.error('JSON 解析失败，原始输出:', output.substring(0, 500));
    throw new Error(`JSON 解析失败: ${e.message}`);
  }
}

async function main() {
    const inputFile = process.argv[2];

    if (!inputFile) {
        console.error('Usage: npx ts-node prompt-generator.ts <input_file>');
        process.exit(1);
    }

    if (!fs.existsSync(inputFile)) {
        console.error(`Input file not found: ${inputFile}`);
        process.exit(1);
    }

    const content = fs.readFileSync(inputFile, 'utf-8').trim();

    if (!content) {
        console.error('Input file is empty');
        process.exit(1);
    }

    console.log('========================================');
    console.log('🖼️  正在生成图片描述 prompt...');
    console.log('========================================');
    console.log(`📝 输入内容长度: ${content.length} 字符`);
    console.log(`📝 内容预览: ${content.substring(0, 100)}...`);
    console.log('');

    try {
        console.log('🔄 正在调用 Claude CLI 生成 prompt...');
        // 使用 Claude CLI 生成 prompt
        const userPrompt = `${SYSTEM_PROMPT}

====================
帖子内容
====================
${content}

请根据以上帖子内容，严格按照 JSON 格式输出图像描述。只输出 JSON，不要任何其他内容。`;

        // 使用 stdin 传递 prompt（与 content-writer 相同的模式）
        console.log('📌 使用 stdin 方式传递 prompt');
        console.log('📌 Prompt 长度:', userPrompt.length, '字符');

        // 使用 spawn 执行 claude 命令（不带 --verbose，与 content-writer 一致）
        const rawOutput = await new Promise<string>((resolve, reject) => {
            const child = spawn('claude', ['--output-format', 'text'], {
                cwd: process.cwd(),
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true,
                env: process.env
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                // 显示生成进度
                process.stdout.write('.');
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            // 超时处理 (90秒)
            const timeout = setTimeout(() => {
                console.log('\n⚠️  Claude 响应超时 (90秒)，尝试终止...');
                child.kill('SIGTERM');
            }, 90000);

            child.on('close', (code) => {
                clearTimeout(timeout);
                console.log(''); // 换行
                if (code === 0) {
                    console.log('✅ Claude CLI 响应成功');
                    resolve(stdout.trim());
                } else {
                    console.log(`❌ Claude CLI 退出码: ${code}`);
                    reject(new Error(`Claude CLI 退出码: ${code}, stderr: ${stderr}`));
                }
            });

            child.on('error', (error) => {
                clearTimeout(timeout);
                console.log('❌ spawn 错误:', error.message);
                reject(error);
            });

            // 通过 stdin 传递 prompt（与 content-writer 一致）
            child.stdin.write(userPrompt);
            child.stdin.end();
            console.log('✅ 已发送 prompt，等待 Claude 响应...');
        });

        console.log('📋 正在解析 JSON 输出...');
        const data = parseAndValidateJSON(rawOutput);

        // 输出生成的 prompt
        console.log('\n生成的 prompt:');
        console.log(data.prompt);

        // 保存到输出文件
        const outputDir = path.join(__dirname, '../../outputs/prompts');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const outputFile = path.join(outputDir, `prompt_${timestamp}.json`);

        const finalData = {
            metadata: {
                generatedAt: new Date().toISOString(),
                inputLength: content.length
            },
            ...data
        };

        fs.writeFileSync(outputFile, JSON.stringify(finalData, null, 2), 'utf-8');
        console.log(`\nPrompt 已保存到: ${outputFile}`);

        // 同时保存一个 .md 文件用于兼容旧代码
        const mdFile = outputFile.replace('.json', '.md');
        fs.writeFileSync(mdFile, data.prompt, 'utf-8');

    } catch (error) {
        console.error('生成 prompt 失败:', error);
        process.exit(1);
    }
}

main();
