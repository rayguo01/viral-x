# Prompt Generator Skill

根据帖子内容生成适合 AI 图像生成的英文 prompt。

## 功能

- 分析帖子的主题、情感和关键元素
- 生成适合社交媒体配图的图像描述
- 输出英文 prompt，优化用于 Gemini 图像生成

## 输入

帖子文本内容（中文或英文）

## 输出

英文图像生成 prompt，包含：
- 视觉风格描述
- 主题元素
- 色彩和氛围建议
- 适合社交媒体的构图建议

## 使用方式

```bash
claude -p "根据以下帖子内容生成图片prompt: {content}" --skill prompt-generator
```
