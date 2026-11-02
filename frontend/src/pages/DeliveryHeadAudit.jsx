import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  DollarSign, 
  Sparkles, 
  ShieldCheck,
  Plus
} from 'lucide-react';

export default function DeliveryHeadAudit({
  currentUser
}) {
  const [calibrationData, setCalibrationData] = useState(null);
  const [kpiMetrics, setKpiMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setErrorNotice(null);
    try {
      const [calRes, kpiRes] = await Promise.all([
        fetch('/api/analytics/calibration-audits', {
          headers: { 'x-user-id': currentUser?.id || 'usr_delivery_head_rajesh' }
        }),
        fetch('/api/analytics/kpi-metrics', {
          headers: { 'x-user-id': currentUser?.id || 'usr_delivery_head_rajesh' }
        })
      ]);

      const calData = await calRes.json();
      const kpis = await kpiRes.json();

      setCalibrationData(calData);
      setKpiMetrics(kpis);
    } catch (err) {
      setErrorNotice(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentUser?.id]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Executive Header Banner */}
      <div 
        className="card" 
        style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
          color: '#ffffff',
          padding: '1.5rem',
          border: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, background: 'rgba(255,255,255,0.2)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                DELIVERY HEAD OVERSIGHT
              </span>
              <span style={{ fontSize: '0.8rem', color: '#c7d2fe' }}>
                Executive Calibration & Business ROI Center
              </span>
            </div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0.2rem 0', color: '#ffffff' }}>
              AI Fairness Calibration & Operational ROI
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#e0e7ff', margin: 0 }}>
              Audit weekly sample alignment between AI automated ranks and recruiter human selections to eliminate bias and maintain client SLA.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Financial & Performance Cards */}
      {kpiMetrics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {/* Card 1: Screening Time Reduction */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Screening Time
              </span>
              <Clock size={18} color="#2563eb" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>
              {kpiMetrics.kpis.screening_time_reduction.achieved}
            </div>
            <p style={{ fontSize: '0.75rem', color: '#059669', margin: '0.25rem 0 0 0', fontWeight: 600 }}>
              Target: {kpiMetrics.kpis.screening_time_reduction.target} (Exceeding)
            </p>
            <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
              {kpiMetrics.kpis.screening_time_reduction.detail}
            </p>
          </div>

          {/* Card 2: 48h Shortlist Turnaround */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Shortlist &le; 48 Hours
              </span>
              <TrendingUp size={18} color="#059669" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>
              {kpiMetrics.kpis.shortlist_turnaround_48h.achieved}
            </div>
            <p style={{ fontSize: '0.75rem', color: '#059669', margin: '0.25rem 0 0 0', fontWeight: 600 }}>
              Target: {kpiMetrics.kpis.shortlist_turnaround_48h.target}
            </p>
            <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
              Turnaround decreased from 5.0 days to 1.8 days
            </p>
          </div>

          {/* Card 3: Client Acceptance Rate */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Client Acceptance Rate
              </span>
              <CheckCircle2 size={18} color="#7c3aed" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>
              {kpiMetrics.kpis.client_acceptance_rate.achieved}
            </div>
            <p style={{ fontSize: '0.75rem', color: '#059669', margin: '0.25rem 0 0 0', fontWeight: 600 }}>
              Target: {kpiMetrics.kpis.client_acceptance_rate.target}
            </p>
            <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
              {kpiMetrics.kpis.client_acceptance_rate.detail}
            </p>
          </div>

          {/* Card 4: Total Business Savings */}
          <div className="card" style={{ padding: '1.25rem', background: '#f0fdf4', borderColor: '#bbf7d0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#065f46', textTransform: 'uppercase' }}>
                Annual Value Realized
              </span>
              <DollarSign size={18} color="#059669" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#047857' }}>
              {kpiMetrics.kpis.annual_cost_savings.total_annual_impact}
            </div>
            <p style={{ fontSize: '0.7rem', color: '#065f46', margin: '0.25rem 0 0 0' }}>
              Recruiter labor savings: {kpiMetrics.kpis.annual_cost_savings.recruiter_hours_saved_value}
            </p>
            <p style={{ fontSize: '0.7rem', color: '#065f46', margin: '0.25rem 0 0 0' }}>
              Fee salvage: {kpiMetrics.kpis.annual_cost_savings.lost_requisition_fee_salvaged}
            </p>
          </div>
        </div>
      )}

      {/* Weekly Calibration Audits Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <BarChart3 size={18} color="#2563eb" />
              Weekly AI vs Recruiter Rank Calibration Samples
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
              Ensures AI scoring remains calibrated with recruiter human judgment and flags algorithmic drift.
            </p>
          </div>

          {calibrationData?.summary && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '0.25rem 0.65rem', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                Alignment Rate: {calibrationData.summary.alignmentRate}
              </span>
            </div>
          )}
        </div>

        <div className="candidate-table-container">
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
              Loading calibration samples...
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Audit Week</th>
                  <th>Requisition & Client</th>
                  <th>Candidate Profile</th>
                  <th>AI Rank</th>
                  <th>Recruiter Rank</th>
                  <th>Discrepancy</th>
                  <th>Calibration Status</th>
                  <th>Recruiter Override Reason & Audit Notes</th>
                </tr>
              </thead>
              <tbody>
                {(calibrationData?.audits || []).map((audit) => (
                  <tr key={audit.id}>
                    <td>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>
                        {audit.week_label}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{audit.requisition_title}</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{audit.client_company}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{audit.candidate_name}</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{audit.candidate_id}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.9rem', color: '#2563eb' }}>
                        #{audit.ai_rank}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.9rem', color: '#0f172a' }}>
                        #{audit.recruiter_rank}
                      </span>
                    </td>
                    <td>
                      <span style={{ 
                        fontWeight: 700, 
                        fontFamily: 'monospace',
                        color: audit.discrepancy_score === 0 ? '#059669' : '#d97706' 
                      }}>
                        &Delta; {audit.discrepancy_score}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        textTransform: 'uppercase',
                        background: audit.agreement_status === 'aligned' ? '#ecfdf5' : '#fffbeb',
                        color: audit.agreement_status === 'aligned' ? '#065f46' : '#92400e',
                        border: `1px solid ${audit.agreement_status === 'aligned' ? '#a7f3d0' : '#fde68a'}`
                      }}>
                        {audit.agreement_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <p style={{ fontSize: '0.8rem', color: '#334155', margin: 0, lineHeight: 1.4, maxWidth: '320px' }}>
                        {audit.recruiter_override_reason}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
