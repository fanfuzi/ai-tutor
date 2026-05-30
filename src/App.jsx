import { useRef, useEffect } from 'react';
import { GameProvider, useGame } from './store';
import AITutorScreen from './screens/AITutorScreen';

function AppContent() {
  return <AITutorScreen />;
}

export default function App() {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
}
