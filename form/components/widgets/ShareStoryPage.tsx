import React, { useEffect, useState } from 'react';
import { generateStoryImage } from '../utils/storyImageGenerator';
import { shareStory, downloadBlob } from '../utils/storyShare';

/**
 * Standalone page for story sharing, opened in a new tab.
 * Outside the iframe, Web Share API Level 2 (with files) works on mobile.
 */
const ShareStoryPage: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'preview' | 'shared' | 'error'>('loading');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);

  // Parse params from hash: #/share-story?ref=ABC123
  const getParams = () => {
    const hash = window.location.hash;
    const queryPart = hash.split('?')[1] || '';
    const params = new URLSearchParams(queryPart);
    return {
      referralCode: params.get('ref') || '',
    };
  };

  useEffect(() => {
    const run = async () => {
      const { referralCode } = getParams();
      const formUrl = (typeof window !== 'undefined' && (window as any).process?.env?.VITE_FORM_URL) || 'https://tibroish.bg/signup';
      const shareUrl = referralCode ? `${formUrl}?ref=${referralCode}` : formUrl;
      const shareText = 'Аз се записах за пазител на вота! Запиши се и ти!';

      try {
        const blob = await generateStoryImage({
          shareUrl,
          shareText,
          referralCode,
        });
        setImageBlob(blob);

        // Show preview with share button - Web Share API requires user gesture
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setStatus('preview');
      } catch {
        setStatus('error');
      }
    };

    run();
  }, []);

  const handleDownload = () => {
    if (imageBlob) {
      downloadBlob(imageBlob, 'tibroish-story.png');
    }
  };

  const handleRetryShare = async () => {
    if (!imageBlob) return;
    const result = await shareStory(imageBlob);
    if (result.method === 'webshare') {
      setStatus('shared');
    }
  };

  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 50%, #0d9488 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      fontFamily: 'sans-serif',
    }}>
      {status === 'loading' && (
        <div style={{ color: 'white', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <p>Генериране на картинка...</p>
        </div>
      )}

      {status === 'shared' && (
        <div style={{ color: 'white', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
          <h2 style={{ marginBottom: '0.5rem' }}>Споделено!</h2>
          <p style={{ opacity: 0.8 }}>Можете да затворите този прозорец.</p>
        </div>
      )}

      {status === 'error' && (
        <div style={{ color: 'white', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠</div>
          <h2 style={{ marginBottom: '0.5rem' }}>Грешка</h2>
          <p style={{ opacity: 0.8 }}>Не успяхме да генерираме картинката.</p>
        </div>
      )}

      {status === 'preview' && previewUrl && (
        <div style={{ textAlign: 'center', maxWidth: '400px', width: '100%' }}>
          <p style={{ color: 'white', marginBottom: '1rem', fontSize: '1.1rem' }}>
            Споделете картинката като Story:
          </p>
          <img
            src={previewUrl}
            alt="Ti Broish Story"
            style={{
              display: 'block',
              margin: '0 auto 1rem',
              width: '100%',
              maxWidth: '300px',
              borderRadius: '12px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleRetryShare}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: 'white',
                color: '#0d9488',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '1rem',
              }}
            >
              Сподели
            </button>
            <button
              type="button"
              onClick={handleDownload}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: '2px solid rgba(255,255,255,0.5)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '1rem',
              }}
            >
              Запази картинката
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShareStoryPage;
