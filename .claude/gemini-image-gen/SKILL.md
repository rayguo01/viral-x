---
name: gemini-image-gen
description: Generate images using Google Gemini's image generation API. Use when users want to create images, generate visual assets, UI mockups, icons, or any image generation requests.
---

# Gemini Image Generation

Generate high-quality images using Google Gemini's image generation API.

## When to Use This Skill

Use this skill when the user requests:
- Image generation from text descriptions
- Visual assets for websites or apps
- Icons, logos, or graphics
- UI mockups or designs
- Any creative image generation task

## Requirements

- Google Gemini API key must be set in environment variable: GEMINI_API_KEY
- Python package: google-genai

## Instructions

When the user requests an image:

1. Understand the requirements (subject, style, dimensions, output filename)

2. Install the required package if needed

3. Create and execute a Python script to generate the image using the google-genai library with model gemini-2.0-flash-exp

4. Set appropriate aspect ratio based on user needs (1:1, 16:9, 9:16, 4:3, 3:4)

5. Save to specified filename and inform the user of the output file location

## Best Practices

- Write detailed, descriptive prompts for better results
- Specify style, mood, and key elements clearly
- For UI elements, mention design style (modern, minimal, etc.)
- For icons, specify size and simplicity level
- Save images to organized directories
- Create the output directory before saving if it doesn't exist

## Example Prompts

Hero Image: "Modern, minimalist hero section background with gradient from deep blue to purple, abstract geometric shapes, professional tech startup aesthetic, high resolution"

Feature Icon: "Simple, clean icon representing artificial intelligence, blue and white color scheme, minimalist style, suitable for website UI"

Product Mockup: "Smartphone displaying a modern writing app interface, clean UI design, on a wooden desk with coffee cup, natural lighting, professional product photography style"
