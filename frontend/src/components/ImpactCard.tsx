// ImpactCard: Sustainability & Financial Impact metrics display (avoided scrap, downtime, CO2, ROI).
import React from 'react';
import type { ImpactMetrics } from '../types';

interface ImpactCardProps {
  impact: ImpactMetrics | null;
}

export default function ImpactCard({ impact }: ImpactCardProps): React.ReactElement {
  const scrapAvoided = impact?.scrap_avoided ?? 240;
  const downtimeMinutes = impact?.downtime_minutes ?? 45;
  const co2Kg = impact?.co2_kg ?? 25.0;
  const costSavings = impact?.cost_savings_usd ?? 3600.0;
  const energyKwh = impact?.energy_kwh ?? 38.0;

  return (
    <div
      style={{
        background: '#0B131F',
        border: '1px solid #1E293B',
        borderRadius: '12px',
        padding: '1.5rem',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1E293B', paddingBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            style={{
              background: '#064E3B',
              color: '#34D399',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              padding: '2px 8px',
              borderRadius: '4px',
              textTransform: 'uppercase',
            }}
          >
            IMPACT CALCULATOR
          </span>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: '#F8FAFC' }}>
            Sustainability & Avoided Scrap Impact
          </h3>
        </div>
        <span style={{ fontSize: '0.8rem', color: '#10B981', fontWeight: 600 }}>
          Direct Operational Value
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        <div style={{ background: '#0F172A', padding: '1rem', borderRadius: '8px', border: '1px solid #1E293B' }}>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase' }}>Scrap Avoided</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#38BDF8', marginTop: '0.25rem' }}>
            {scrapAvoided} <span style={{ fontSize: '0.85rem', fontWeight: 400, color: '#94A3B8' }}>parts</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>Defects prevented before containment</div>
        </div>

        <div style={{ background: '#0F172A', padding: '1rem', borderRadius: '8px', border: '1px solid #1E293B' }}>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase' }}>Downtime Saved</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#F59E0B', marginTop: '0.25rem' }}>
            {downtimeMinutes} <span style={{ fontSize: '0.85rem', fontWeight: 400, color: '#94A3B8' }}>min</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>Faster autonomous diagnosis & repair</div>
        </div>

        <div style={{ background: '#0F172A', padding: '1rem', borderRadius: '8px', border: '1px solid #1E293B' }}>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase' }}>GHG & Energy Avoided</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10B981', marginTop: '0.25rem' }}>
            {co2Kg.toFixed(1)} <span style={{ fontSize: '0.85rem', fontWeight: 400, color: '#94A3B8' }}>kg CO₂e</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>
            {energyKwh.toFixed(1)} kWh energy + embodied material avoided
          </div>
        </div>

        <div style={{ background: '#0F172A', padding: '1rem', borderRadius: '8px', border: '1px solid #1E293B' }}>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase' }}>Net Financial Savings</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#A78BFA', marginTop: '0.25rem' }}>
            ${costSavings.toLocaleString()} <span style={{ fontSize: '0.85rem', fontWeight: 400, color: '#94A3B8' }}>USD</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>Avoided tooling scrap + lost production</div>
        </div>
      </div>
    </div>
  );
}
