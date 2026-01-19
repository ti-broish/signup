
import React, { useEffect, useState } from 'react';
import WidgetPortal from './components/WidgetPortal';
import SignUpWidget from './components/widgets/SignUpWidget';
import { WidgetType } from './types';

/**
 * App component manages the simple internal routing system.
 * It detects the hash in the URL to decide whether to render
 * the full management dashboard (the "Shell") or just a 
 * standalone widget meant for an iframe.
 */
const App: React.FC = () => {
  const [route, setRoute] = useState<string>(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(window.location.hash);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Simple Router Implementation
  const renderContent = () => {
    // Match /#/widget/{id}
    const widgetMatch = route.match(/^#\/widget\/(.+)$/);

    if (widgetMatch) {
      const widgetId = widgetMatch[1];

      // Parse URL parameters for widget configuration
      const urlParams = new URLSearchParams(window.location.search);
      const privacyUrl = urlParams.get('privacyUrl') || undefined;

      // Standalone widget rendering for iframes
      // This view has no padding, no shell, only the component.
      return (
        <div className="w-full h-screen overflow-hidden">
          {(() => {
            switch (widgetId) {
              case WidgetType.SIGNUP:
                return <SignUpWidget privacyUrl={privacyUrl} />;
              default:
                return (
                  <div className="flex items-center justify-center h-full text-gray-400 bg-gray-50 italic">
                    Widget "{widgetId}" not found.
                  </div>
                );
            }
          })()}
        </div>
      );
    }

    // Default: The Management Portal (Shell)
    return <WidgetPortal />;
  };

  return (
    <div className="min-h-screen">
      {renderContent()}
    </div>
  );
};

export default App;
