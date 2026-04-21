import React, { useState } from 'react';
import { validateUserInput } from '../validation';
import { generatePlan } from '../planner';
import { savePlan } from '../storage';
import type { UserInput, Chronotype } from '../types';

interface Props {
  onPlanSaved: (id: string) => void;
  onAbout: () => void;
}

const field: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, marginBottom: '0.75rem',
};
const input: React.CSSProperties = {
  background: '#111', border: '1px solid #444', color: '#f0f0f0',
  borderRadius: 4, padding: '0.4rem 0.5rem', fontSize: '1rem',
};
const label: React.CSSProperties = { fontSize: '0.8rem', color: '#aaa', marginBottom: 2 };
const btn: React.CSSProperties = {
  background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4,
  padding: '0.6rem 1.2rem', fontSize: '1rem', cursor: 'pointer', marginTop: '0.5rem',
};

export default function InputForm({ onPlanSaved, onAbout }: Props) {
  const [originTZ, setOriginTZ] = useState('Europe/London');
  const [destinationTZ, setDestinationTZ] = useState('Australia/Sydney');
  const [departureDateTime, setDeparture] = useState('2025-06-01T10:00');
  const [arrivalDateTime, setArrival] = useState('2025-06-02T17:00');
  const [chronotype, setChronotype] = useState<Chronotype>('intermediate');
  const [habitualSleepStart, setSleep] = useState('23:00');
  const [habitualWakeTime, setWake] = useState('07:00');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const userInput: UserInput = {
      originTZ, destinationTZ,
      departureDateTime, arrivalDateTime,
      chronotype, habitualSleepStart, habitualWakeTime,
      layovers: [],
    };
    const result = validateUserInput(userInput);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const plan = generatePlan(userInput);
      const id = crypto.randomUUID();
      await savePlan({ id, ...(plan as unknown as Record<string, unknown>) });
      onPlanSaved(id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem' }}>JetShift</h1>
        <button onClick={onAbout} style={{ ...btn, background: 'transparent', border: '1px solid #444', fontSize: '0.85rem', padding: '0.3rem 0.8rem' }}>About</button>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={field}>
          <span style={label}>Origin timezone (IANA)</span>
          <input style={input} value={originTZ} onChange={e => setOriginTZ(e.target.value)} placeholder="e.g. Europe/London" />
        </div>
        <div style={field}>
          <span style={label}>Destination timezone (IANA)</span>
          <input style={input} value={destinationTZ} onChange={e => setDestinationTZ(e.target.value)} placeholder="e.g. Australia/Sydney" />
        </div>
        <div style={field}>
          <span style={label}>Departure (local time)</span>
          <input style={input} type="datetime-local" value={departureDateTime} onChange={e => setDeparture(e.target.value)} />
        </div>
        <div style={field}>
          <span style={label}>Arrival (local time)</span>
          <input style={input} type="datetime-local" value={arrivalDateTime} onChange={e => setArrival(e.target.value)} />
        </div>
        <div style={field}>
          <span style={label}>Chronotype</span>
          <select style={input} value={chronotype} onChange={e => setChronotype(e.target.value as Chronotype)}>
            <option value="early">Early bird</option>
            <option value="intermediate">Intermediate</option>
            <option value="late">Night owl</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div style={field}>
            <span style={label}>Usual sleep time</span>
            <input style={input} type="time" value={habitualSleepStart} onChange={e => setSleep(e.target.value)} />
          </div>
          <div style={field}>
            <span style={label}>Usual wake time</span>
            <input style={input} type="time" value={habitualWakeTime} onChange={e => setWake(e.target.value)} />
          </div>
        </div>
        {errors.length > 0 && (
          <ul style={{ color: '#f87171', margin: '0.75rem 0', paddingLeft: '1.2rem' }}>
            {errors.map(err => <li key={err}>{err}</li>)}
          </ul>
        )}
        <button type="submit" style={btn} disabled={saving}>
          {saving ? 'Generating…' : 'Generate Plan'}
        </button>
      </form>
    </div>
  );
}
