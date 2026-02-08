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

  // 1. Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, '#0d9488');
  gradient.addColorStop(0.5, '#14b8a6');
  gradient.addColorStop(1, '#0d9488');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 2. Decorative circles (subtle)
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(150, 300, 200, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(930, 1600, 250, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // 3. Logo text "Ти Броиш"
  ctx.fillStyle = 'white';
  ctx.font = 'bold 96px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Ти Броиш', WIDTH / 2, 250);

  // Subtitle
  ctx.font = '36px sans-serif';
  ctx.globalAlpha = 0.85;
  ctx.fillText('Пазители на вота', WIDTH / 2, 340);
  ctx.globalAlpha = 1;

  // 4. Checkmark
  drawCheckmark(ctx, WIDTH / 2, 560, 100);

  // 5. Success text
  ctx.fillStyle = 'white';
  ctx.font = 'bold 56px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Успешна регистрация!', WIDTH / 2, 760);

  // 6. Share text (word-wrapped)
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
  const boxY = shareTextY + 60;
  const boxWidth = WIDTH - PADDING * 2;
  const boxHeight = 160;
  const boxX = PADDING;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 20);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 20);
  ctx.stroke();

  ctx.fillStyle = 'white';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Запиши се и ти:', WIDTH / 2, boxY + 60);

  ctx.font = '32px monospace';
  ctx.globalAlpha = 0.9;
  ctx.fillText(params.shareUrl, WIDTH / 2, boxY + 115);
  ctx.globalAlpha = 1;

  // 8. Referral code highlight
  const codeY = boxY + boxHeight + 80;
  const codeBoxWidth = 400;
  const codeBoxX = (WIDTH - codeBoxWidth) / 2;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  drawRoundedRect(ctx, codeBoxX, codeY, codeBoxWidth, 80, 40);
  ctx.fill();

  ctx.fillStyle = 'white';
  ctx.font = 'bold 38px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Код: ${params.referralCode}`, WIDTH / 2, codeY + 50);

  // 9. CTA
  ctx.fillStyle = 'white';
  ctx.font = '36px sans-serif';
  ctx.globalAlpha = 0.85;
  ctx.fillText('Посети линка и се запиши!', WIDTH / 2, 1550);
  ctx.globalAlpha = 1;

  // 10. Footer branding
  ctx.font = 'bold 32px sans-serif';
  ctx.globalAlpha = 0.6;
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
