import React from 'react';

interface Props {
  onClose: () => void;
}

export default function AboutModal({ onClose }: Props) {
  return (
    <div style={overlay}>
      <div style={box}>
        <h2>About JetShift</h2>
        <p style={{ margin: '1rem 0' }}>
          JetShift generates a personalised 7-day jet-lag mitigation plan using the
          Kronauer/Jewett/Forger circadian oscillator model. Light exposure, meal
          timing, caffeine, and melatonin cues are scheduled to shift your circadian
          rhythm toward the destination timezone.
        </p>
        <p style={{ fontSize: '0.8rem', color: '#aaa' }}>
          <strong>Disclaimer:</strong> This tool is for informational purposes only
          and does not constitute medical advice. Consult a healthcare professional
          before making changes to sleep or medication routines.
        </p>
        <button onClick={onClose} style={{ marginTop: '1.5rem' }}>Close</button>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
};
const box: React.CSSProperties = {
  background: '#1a1a1a', border: '1px solid #333', borderRadius: 8,
  padding: '1.5rem', maxWidth: 480, width: '90%',
};
