/**
 * Generates a 1080x1920 (9:16) Story image using the Canvas API
 * with Ti Broish branding for social media sharing.
 */

interface StoryImageParams {
  shareUrl: string;
  shareText: string;
  referralCode: string;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
  return currentY + lineHeight;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCheckmark(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
): void {
  // White circle
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();

  // Teal checkmark
  ctx.strokeStyle = '#0d9488';
  ctx.lineWidth = radius * 0.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(centerX - radius * 0.35, centerY + radius * 0.05);
  ctx.lineTo(centerX - radius * 0.05, centerY + radius * 0.35);
  ctx.lineTo(centerX + radius * 0.4, centerY - radius * 0.25);
  ctx.stroke();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

export async function generateStoryImage(params: StoryImageParams): Promise<Blob> {
  const WIDTH = 1080;
  const HEIGHT = 1920;
  const PADDING = 80;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  // Load illustration (start loading early, await later)
  const illustrationPromise = loadImage('/vote-guradians.jpg').catch(() => null);

  const TEAL = '#0d9488';
  const DARK = '#1e293b';

  // 1. White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 2. Draw illustration as background (cover, centered)
  const illustration = await illustrationPromise;
  if (illustration) {
    const scale = Math.min(WIDTH / illustration.width, HEIGHT / illustration.height) * 0.7;
    const imgW = illustration.width * scale;
    const imgH = illustration.height * scale;
    const imgX = (WIDTH - imgW) / 2;
    const imgY = (HEIGHT - imgH) / 2;

    // Draw slightly faded so text is readable
    ctx.globalAlpha = 0.15;
    ctx.drawImage(illustration, imgX, imgY, imgW, imgH);
    ctx.globalAlpha = 1;
  }

  // 3. Logo text "Ти Броиш"
  ctx.fillStyle = TEAL;
  ctx.font = 'bold 96px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Ти Броиш', WIDTH / 2, 250);

  // Subtitle
  ctx.fillStyle = '#475569';
  ctx.font = '36px sans-serif';
  ctx.fillText('Пазители на вота', WIDTH / 2, 340);

  // 4. Checkmark (teal circle with white check)
  ctx.beginPath();
  ctx.arc(WIDTH / 2, 560, 100, 0, Math.PI * 2);
  ctx.fillStyle = TEAL;
  ctx.fill();

  ctx.strokeStyle = 'white';
  ctx.lineWidth = 20;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 35, 560 + 5);
  ctx.lineTo(WIDTH / 2 - 5, 560 + 35);
  ctx.lineTo(WIDTH / 2 + 40, 560 - 25);
  ctx.stroke();

  // 5. Success text
  ctx.fillStyle = DARK;
  ctx.font = 'bold 56px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Успешна регистрация!', WIDTH / 2, 760);

  // 6. Share text (word-wrapped)
  ctx.fillStyle = '#475569';
  ctx.font = '44px sans-serif';
  ctx.textAlign = 'center';
  const shareTextY = wrapText(
    ctx,
    params.shareText,
    WIDTH / 2,
    880,
    WIDTH - PADDING * 2,
    60,
  );

  // 7. URL box
  const boxY = shareTextY + 280;
  const boxWidth = WIDTH - PADDING * 2;
  const boxHeight = 160;
  const boxX = PADDING;

  ctx.fillStyle = 'rgba(13, 148, 136, 0.08)';
  drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 20);
  ctx.fill();

  ctx.strokeStyle = 'rgba(13, 148, 136, 0.3)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 20);
  ctx.stroke();

  ctx.fillStyle = TEAL;
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Запиши се и ти:', WIDTH / 2, boxY + 60);

  ctx.fillStyle = DARK;
  ctx.font = '32px monospace';
  ctx.fillText(params.shareUrl, WIDTH / 2, boxY + 115);

  // 9. CTA
  ctx.fillStyle = '#475569';
  ctx.font = '36px sans-serif';
  ctx.fillText('Посети линка и се запиши!', WIDTH / 2, 1550);

  // 10. Footer branding
  ctx.fillStyle = TEAL;
  ctx.font = 'bold 32px sans-serif';
  ctx.globalAlpha = 0.5;
  ctx.fillText('tibroish.bg', WIDTH / 2, 1820);
  ctx.globalAlpha = 1;

  // Convert to blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to generate image blob'));
        }
      },
      'image/png',
    );
  });
}
