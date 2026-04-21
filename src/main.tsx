import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import InputForm from './ui/InputForm';
import PlanView from './ui/PlanView';
import AboutModal from './ui/AboutModal';

type View = 'form' | 'plan';

function App() {
  const [view, setView] = useState<View>('form');
  const [planId, setPlanId] = useState('');
  const [showAbout, setShowAbout] = useState(false);

  function handlePlanSaved(id: string) {
    setPlanId(id);
    setView('plan');
  }

  return (
    <>
      {view === 'form' && (
        <InputForm onPlanSaved={handlePlanSaved} onAbout={() => setShowAbout(true)} />
      )}
      {view === 'plan' && planId && (
        <PlanView planId={planId} onBack={() => setView('form')} />
      )}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) createRoot(rootEl).render(<React.StrictMode><App /></React.StrictMode>);
