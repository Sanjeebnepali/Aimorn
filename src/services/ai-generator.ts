/**
 * Free AI Image Generation Service using Pollinations.ai (FLUX / SDXL model)
 * Requires NO API Keys, 100% Free, high quality 8K vertical wallpaper output.
 */

export type GenerateParams = {
  mode?: 'couple' | 'solo';
  style?: string;
  description?: string;
  youImage?: string | null;
  partnerImage?: string | null;
};

export function buildWallpaperPrompt(params: GenerateParams): string {
  const mode = params.mode ?? 'couple';
  const style = params.style ?? 'realistic';
  const description = params.description ?? '';

  const stylePrompts: Record<string, string> = {
    realistic: 'ultra-realistic photorealistic 8k photo, cinematic lighting, portrait photography, masterpiece',
    'neon-noir': 'glowing neon lights, cyber noir aesthetic, vibrant magenta and cyan glow, dark atmospheric street',
    anime: 'vibrant anime artwork, Makoto Shinkai style, beautifully detailed sky, digital painting',
    cyberpunk: 'futuristic cyberpunk city, holographic neon effects, high contrast, futuristic sci-fi tech aesthetics',
    vintage: '70s vintage film aesthetic, warm nostalgic tones, film grain, analog camera lighting',
  };

  const styleText = stylePrompts[style.toLowerCase()] || `${style} artistic style`;

  let promptCore = '';
  if (mode === 'solo') {
    promptCore = 'A stunning aesthetic portrait wallpaper of a person';
  } else {
    promptCore = 'A romantic aesthetic wallpaper of a young loving couple together';
  }

  if (description && description.trim().length > 0) {
    promptCore += `, ${description.trim()}`;
  } else {
    promptCore += `, golden hour background, magical atmosphere, vertical phone wallpaper framing`;
  }

  return `${promptCore}, ${styleText}, 8k resolution, masterpiece, trending on ArtStation`;
}

export function getFreeAIImageUrl(params: GenerateParams): string {
  const fullPrompt = buildWallpaperPrompt(params);
  const seed = Math.floor(Math.random() * 1000000);
  const encodedPrompt = encodeURIComponent(fullPrompt);
  // Pollinations.ai free API endpoint (width: 1080, height: 1920 for vertical wallpaper)
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1080&height=1920&seed=${seed}&model=flux&nologo=true`;
}
