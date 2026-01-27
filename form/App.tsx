import React from 'react';
import SignUpWidget from './components/widgets/SignUpWidget';

/**
 * App component - renders the SignUpWidget directly
 */
const App: React.FC = () => {
  return (
    <div className="w-full min-h-screen">
      <SignUpWidget />
    </div>
  );
};

export default App;
