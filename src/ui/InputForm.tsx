import React, { useState } from 'react';
import { validateUserInput } from '../validation';
import { generatePlan } from '../planner';
import { savePlan } from '../storage';
import { TZ_OPTIONS, TZ_OTHER } from '../constants/timezones';
import type { UserInput, Chronotype, Layover } from '../types';

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

function TZSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isPreset = TZ_OPTIONS.some(o => o.value === value);
  return (
    <>
      <select
        style={input}
        value={isPreset ? value : TZ_OTHER}
        onChange={e => onChange(e.target.value === TZ_OTHER ? '' : e.target.value)}
      >
        {TZ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        <option value={TZ_OTHER}>Other (IANA)…</option>
      </select>
      {!isPreset && (
        <input
          style={{ ...input, marginTop: 4 }}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="e.g. Asia/Dubai"
        />
      )}
    </>
  );
}

export default function InputForm({ onPlanSaved, onAbout }: Props) {
  const [originTZ, setOriginTZ] = useState('Europe/London');
  const [destinationTZ, setDestinationTZ] = useState('Australia/Melbourne');
  const [departureDateTime, setDeparture] = useState('2025-06-01T10:00');
  const [arrivalDateTime, setArrival] = useState('2025-06-02T17:00');
  const [chronotype, setChronotype] = useState<Chronotype>('intermediate');
  const [preTravelDays, setPreTravelDays] = useState(3);
  const [habitualSleepStart, setSleep] = useState('23:00');
  const [habitualWakeTime, setWake] = useState('07:00');
  const [layovers, setLayovers] = useState<Layover[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function addLayover() {
    setLayovers(ls => [...ls, { airport: '', layoverTZ: 'Asia/Dubai', arrivalLocal: '', departureLocal: '' }]);
  }
  function updateLayover(index: number, patch: Partial<Layover>) {
    setLayovers(ls => ls.map((l, i) => i === index ? { ...l, ...patch } : l));
  }
  function removeLayover(index: number) {
    setLayovers(ls => ls.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const userInput: UserInput = {
      originTZ, destinationTZ,
      departureDateTime, arrivalDateTime,
      chronotype, preTravelDays, habitualSleepStart, habitualWakeTime,
      layovers,
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
          <span style={label}>Origin timezone</span>
          <TZSelect value={originTZ} onChange={setOriginTZ} />
        </div>
        <div style={field}>
          <span style={label}>Destination timezone</span>
          <TZSelect value={destinationTZ} onChange={setDestinationTZ} />
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
          <span style={label}>Layovers</span>
          {layovers.map((l, i) => (
            <div key={i} style={{ border: '1px solid #333', borderRadius: 4, padding: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: 4 }}>
                <input style={{ ...input, flex: 1 }} value={l.airport} onChange={e => updateLayover(i, { airport: e.target.value })} placeholder="Airport (e.g. DXB)" />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <TZSelect value={l.layoverTZ} onChange={v => updateLayover(i, { layoverTZ: v })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <input style={input} type="datetime-local" value={l.arrivalLocal} onChange={e => updateLayover(i, { arrivalLocal: e.target.value })} />
                <input style={input} type="datetime-local" value={l.departureLocal} onChange={e => updateLayover(i, { departureLocal: e.target.value })} />
              </div>
              <button type="button" onClick={() => removeLayover(i)} style={{ ...btn, background: 'transparent', border: '1px solid #444', fontSize: '0.75rem', padding: '0.25rem 0.6rem', marginTop: '0.4rem' }}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={addLayover} style={{ ...btn, background: 'transparent', border: '1px solid #444', fontSize: '0.8rem', padding: '0.3rem 0.8rem', marginTop: 0 }}>+ Add layover</button>
        </div>
        <div style={field}>
          <span style={label}>Chronotype</span>
          <select style={input} value={chronotype} onChange={e => setChronotype(e.target.value as Chronotype)}>
            <option value="early">Early bird</option>
            <option value="intermediate">Intermediate</option>
            <option value="late">Night owl</option>
          </select>
        </div>
        <div style={field}>
          <span style={label}>Pre-travel prep</span>
          <select style={input} value={preTravelDays} onChange={e => setPreTravelDays(Number(e.target.value))}>
            <option value={3}>3 days before departure</option>
            <option value={4}>4 days before departure</option>
            <option value={5}>5 days before departure</option>
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
