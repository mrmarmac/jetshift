import React, { useEffect, useState } from 'react';
import { getPlan } from '../storage';
import type { JetLagPlan, DayPlan, HourBlock, Action } from '../types';

interface Props {
  planId: string;
  onBack: () => void;
}

type StoredPlan = JetLagPlan & { id: string };

const PHASE_COLOUR: Record<string, string> = {
  'pre-travel': '#7c3aed',
  'travel': '#0891b2',
  'post-arrival': '#059669',
};

const ACTION_COLOUR: Record<string, string> = {
  'seek-light': '#fbbf24',
  'avoid-light': '#1e40af',
  'sleep': '#6b7280',
  'meal': '#10b981',
  'fast': '#f59e0b',
  'caffeine-avoid': '#dc2626',
  'melatonin-flag': '#8b5cf6',
};

function ActionBadge({ action }: { action: Action }) {
  const bg = ACTION_COLOUR[action.type] ?? '#374151';
  return (
    <span style={{ background: bg, borderRadius: 4, padding: '1px 6px', fontSize: '0.7rem', marginRight: 4, marginBottom: 2, display: 'inline-block' }}>
      {action.label}
    </span>
  );
}

function HourRow({ block, selected, onClick }: { block: HourBlock; selected: boolean; onClick: () => void }) {
  const hasCritical = block.actions.some(a => a.priority === 'critical');
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '0.35rem 0.5rem', borderRadius: 4, cursor: 'pointer',
        background: selected ? '#1e293b' : 'transparent',
        borderLeft: hasCritical ? '3px solid #fbbf24' : '3px solid transparent',
        marginBottom: 2,
      }}
    >
      <span style={{ width: 40, flexShrink: 0, color: '#9ca3af', fontSize: '0.8rem', paddingTop: 2 }}>{block.localTime}</span>
      <div style={{ flexWrap: 'wrap', display: 'flex' }}>
        {block.actions.length === 0
          ? <span style={{ color: '#4b5563', fontSize: '0.75rem' }}>—</span>
          : block.actions.map((a, i) => <ActionBadge key={i} action={a} />)
        }
      </div>
    </div>
  );
}

function DayPanel({ day }: { day: DayPlan }) {
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const selected = selectedHour !== null ? (day.hourlyBlocks[selectedHour] ?? null) : null;

  return (
    <div>
      <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
        CBT min: <strong style={{ color: '#f0f0f0' }}>{day.cbtMinEstimate}</strong>
      </div>
      <div style={{ height: '60vh', overflowY: 'auto' }}>
        {day.hourlyBlocks.map(block => (
          <HourRow
            key={block.hour}
            block={block}
            selected={selectedHour === block.hour}
            onClick={() => setSelectedHour(h => h === block.hour ? null : block.hour)}
          />
        ))}
      </div>
      {selected && (
        <div style={{ marginTop: '0.75rem', background: '#1e293b', borderRadius: 6, padding: '0.75rem' }}>
          <strong>{selected.localTime}</strong>
          {selected.actions.length === 0
            ? <p style={{ color: '#6b7280', marginTop: 4 }}>No actions this hour.</p>
            : selected.actions.map((a, i) => (
                <div key={i} style={{ marginTop: 6 }}>
                  <ActionBadge action={a} />
                  <span style={{ fontSize: '0.8rem', color: '#9ca3af', marginLeft: 4 }}>
                    {a.priority}
                  </span>
                </div>
              ))
          }
        </div>
      )}
    </div>
  );
}

export default function PlanView({ planId, onBack }: Props) {
  const [plan, setPlan] = useState<StoredPlan | null>(null);
  const [activeDay, setActiveDay] = useState(0);

  useEffect(() => {
    getPlan(planId).then(raw => {
      if (raw) setPlan(raw as unknown as StoredPlan);
    });
  }, [planId]);

  if (!plan) return <div style={{ padding: '2rem', color: '#9ca3af' }}>Loading…</div>;

  const meta = plan.metadata;
  const day = plan.days[activeDay];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <button onClick={onBack} style={{ background: 'transparent', border: '1px solid #444', color: '#f0f0f0', borderRadius: 4, padding: '0.3rem 0.8rem', cursor: 'pointer' }}>← Back</button>
        <div>
          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
            {meta.direction} · {meta.tzShiftHours > 0 ? '+' : ''}{meta.tzShiftHours}h · {meta.chronotype}
          </span>
        </div>
      </div>

      {/* Day tabs */}
      <div style={{ display: 'flex', overflowX: 'auto', gap: 4, marginBottom: '1rem', paddingBottom: 4 }}>
        {plan.days.map((d, i) => (
          <button
            key={i}
            onClick={() => setActiveDay(i)}
            style={{
              flexShrink: 0, border: 'none', borderRadius: 6, padding: '0.4rem 0.75rem',
              cursor: 'pointer', fontSize: '0.75rem',
              background: activeDay === i ? (PHASE_COLOUR[d.phase] ?? '#374151') : '#1a1a1a',
              color: '#f0f0f0',
              outline: activeDay === i ? '2px solid #fff' : 'none',
            }}
          >
            <div style={{ fontWeight: 600 }}>{d.date}</div>
            <div style={{ opacity: 0.8 }}>{d.phase}</div>
          </button>
        ))}
      </div>

      {day && <DayPanel day={day} />}
    </div>
  );
}
