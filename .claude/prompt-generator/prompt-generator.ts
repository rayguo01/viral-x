/**
 * Prompt Generator - 根据帖子内容生成 AI 图像生成 prompt
 *
 * 使用 Claude CLI 生成适合社交媒体配图的英文 prompt
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

// JSON Schema 定义
const JSON_SCHEMA = `
{
  "prompt": "Complete image generation description in English, 2-4 sentences, detailed and vivid",
  "style": "Style suggestion (e.g., modern minimalist, vibrant, vintage, cinematic)",
  "mood": "Mood description (e.g., warm, dramatic, energetic, serene)",
  "elements": ["visual element 1", "visual element 2", "visual element 3"],
  "colorTone": "Color tone suggestion (e.g., warm tones, cool tones, high contrast, pastel)"
}`;

const SYSTEM_PROMPT = `You are a professional social media image description expert.

Based on the given social media post content, generate an AI image generation prompt in ENGLISH.

Requirements:
1. Analyze the theme, emotion, and key elements of the post
2. Create a visually striking image description
3. Include style suggestions (modern, minimalist, vibrant, vintage, cinematic, etc.)
4. Suggest appropriate color tones and atmosphere
5. Composition suitable for social media (eye-catching, engaging)
6. The prompt MUST be in English for optimal AI image generation results

====================
Output Format (CRITICAL)
====================
You must strictly follow this JSON format, output nothing else:

${JSON_SCHEMA}

Important:
1. Output must be valid JSON
2. The "prompt" field is the most important - write 2-4 detailed sentences describing the complete scene
3. ALL text must be in ENGLISH
4. Do not add any explanation before or after the JSON
5. Do not wrap in markdown code blocks`;

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
