import React from 'react';
import { 
  Briefcase, 
  Users, 
  UploadCloud, 
  GitPullRequest, 
  ExternalLink, 
  ShieldCheck, 
  BarChart3, 
  RotateCcw,
  Sparkles,
  Building2
} from 'lucide-react';
import { User, Requisition } from '../types';

interface NavbarProps {
  currentUser: User | null;
  users: User[];
  onSwitchUser: (userId: string) => void;
  currentRequisition: Requisition | null;
  requisitions: Requisition[];
  onSelectRequisition: (reqId: string) => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onResetData: () => void;
  isResetting: boolean;
}

export default function Navbar({
  currentUser,
  users,
  onSwitchUser,
  currentRequisition,
  requisitions,
  onSelectTab,
  activeTab,
  onSelectRequisition,
  onResetData,
  isResetting
}: NavbarProps) {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        {/* Brand / Logo */}
        <div className="brand-section">
          <div className="brand-logo-badge">
            <Sparkles size={22} />
          </div>
          <div className="brand-title">
            <span>Company A Staffing</span>
            <span className="brand-subtitle">AI Resume Screening & Client Shortlist Portal</span>
          </div>
        </div>

        {/* Center: Active Requisition Selector */}
        {requisitions && requisitions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f1f5f9', padding: '0.3rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <Building2 size={16} color="#64748b" />
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Job:</span>
            <select
              value={currentRequisition?.id || ''}
              onChange={(e) => onSelectRequisition(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                fontWeight: 600,
                fontSize: '0.85rem',
                color: '#0f172a',
                outline: 'none',
                cursor: 'pointer',
                maxWidth: '260px'
              }}
            >
              {requisitions.map((req) => (
                <option key={req.id} value={req.id}>
                  {req.id} - {req.title} ({req.client_company})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Right Action Controls: Role Switcher & Reset Button */}
        <div className="navbar-actions">
          {/* 1-Click Reset Sample Data */}
          <button
            onClick={onResetData}
            disabled={isResetting}
            className="btn btn-secondary btn-sm"
            title="Reset database to realistic Company A sample data"
          >
            <RotateCcw size={14} className={isResetting ? 'spin' : ''} />
            <span>{isResetting ? 'Resetting...' : 'Reset Data'}</span>
          </button>

          {/* Role Switcher */}
          <div className="role-switcher-box">
            <Users size={16} color="#475569" />
            <select
              className="role-select"
              value={currentUser?.id || ''}
              onChange={(e) => onSwitchUser(e.target.value)}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role.replace(/_/g, ' ')})
                </option>
              ))}
            </select>
            <span className={`role-badge ${
              currentUser?.role === 'recruiter' ? 'recruiter' : 
              currentUser?.role === 'client_hiring_manager' ? 'client' : 'delivery'
            }`}>
              {currentUser?.role === 'recruiter' ? 'Recruiter' : 
               currentUser?.role === 'client_hiring_manager' ? 'Client' : 'Delivery Head'}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <nav className="nav-tabs-bar">
        <div className="nav-tabs-inner">
          <button
            onClick={() => onSelectTab('scorecard')}
            className={`nav-tab-btn ${activeTab === 'scorecard' ? 'active' : ''}`}
          >
            <Briefcase size={16} />
            <span>JD Scorecard</span>
          </button>

          <button
            onClick={() => onSelectTab('candidates')}
            className={`nav-tab-btn ${activeTab === 'candidates' ? 'active' : ''}`}
          >
            <Sparkles size={16} />
            <span>Ranked Candidates & Evidence</span>
          </button>

          <button
            onClick={() => onSelectTab('upload')}
            className={`nav-tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
          >
            <UploadCloud size={16} />
            <span>Bulk CV Upload</span>
          </button>

          <button
            onClick={() => onSelectTab('pipeline')}
            className={`nav-tab-btn ${activeTab === 'pipeline' ? 'active' : ''}`}
          >
            <GitPullRequest size={16} />
            <span>Requisition Pipeline</span>
          </button>

          <button
            onClick={() => onSelectTab('client')}
            className={`nav-tab-btn ${activeTab === 'client' ? 'active' : ''}`}
          >
            <ExternalLink size={16} />
            <span>Client Shortlist Portal (Masked)</span>
          </button>

          <button
            onClick={() => onSelectTab('calibration')}
            className={`nav-tab-btn ${activeTab === 'calibration' ? 'active' : ''}`}
          >
            <BarChart3 size={16} />
            <span>Delivery Head Calibration</span>
          </button>

          <button
            onClick={() => onSelectTab('dpdp')}
            className={`nav-tab-btn ${activeTab === 'dpdp' ? 'active' : ''}`}
          >
            <ShieldCheck size={16} />
            <span>DPDP Compliance</span>
          </button>
        </div>
      </nav>
    </header>
  );
}
