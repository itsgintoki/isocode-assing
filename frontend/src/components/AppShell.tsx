import React from 'react';
import {
  BarChart3,
  BriefcaseBusiness,
  ChevronDown,
  FileUp,
  GitBranch,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Requisition, User } from '../types';
import { Brand } from './Brand';

export type AppView = 'candidates' | 'upload' | 'pipeline' | 'scorecard' | 'insights' | 'compliance' | 'shortlist';

interface NavItem {
  id: AppView;
  label: string;
  icon: LucideIcon;
}

const INTERNAL_NAV: NavItem[] = [
  { id: 'candidates', label: 'Candidates', icon: Users },
  { id: 'upload', label: 'Add CVs', icon: FileUp },
  { id: 'pipeline', label: 'Pipeline', icon: GitBranch },
  { id: 'scorecard', label: 'Scorecard', icon: SlidersHorizontal }
];

const OVERSIGHT_NAV: NavItem[] = [
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'compliance', label: 'Compliance', icon: ShieldCheck }
];

const CLIENT_NAV: NavItem[] = [{ id: 'shortlist', label: 'Shortlist', icon: BriefcaseBusiness }];

const VIEW_META: Record<AppView, { title: string; eyebrow: string }> = {
  candidates: { title: 'Candidates', eyebrow: 'Ranked against the scorecard' },
  upload: { title: 'Add CVs', eyebrow: 'Parse, deduplicate and score' },
  pipeline: { title: 'Pipeline', eyebrow: 'Move candidates with intent' },
  scorecard: { title: 'Scorecard', eyebrow: 'The criteria behind every score' },
  insights: { title: 'Insights', eyebrow: 'Delivery health, measured honestly' },
  compliance: { title: 'Compliance', eyebrow: 'Consent, access and erasure' },
  shortlist: { title: 'Client shortlist', eyebrow: 'Recruiter-verified profiles only' }
};

const ROLE_LABEL: Record<string, string> = {
  recruiter: 'Recruiter',
  client_hiring_manager: 'Client hiring manager',
  delivery_head: 'Delivery head'
};

interface AppShellProps {
  user: User;
  requisitions: Requisition[];
  currentRequisition: Requisition | null;
  activeView: AppView;
  mobileNavOpen: boolean;
  onMobileNav: (open: boolean) => void;
  onSelectRequisition: (id: string) => void;
  onNavigate: (view: AppView) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function AppShell({
  user,
  requisitions,
  currentRequisition,
  activeView,
  mobileNavOpen,
  onMobileNav,
  onSelectRequisition,
  onNavigate,
  onLogout,
  children
}: AppShellProps) {
  const isClient = user.role === 'client_hiring_manager';
  const isDeliveryHead = user.role === 'delivery_head';
  const navItems = isClient ? CLIENT_NAV : [...INTERNAL_NAV, ...(isDeliveryHead ? OVERSIGHT_NAV : [{ id: 'compliance' as AppView, label: 'Compliance', icon: ShieldCheck }])];
  const meta = VIEW_META[activeView];

  const navigate = (view: AppView) => {
    onNavigate(view);
    onMobileNav(false);
  };

  return (
    <div className="shell">
      <aside className={`sidebar ${mobileNavOpen ? 'is-open' : ''}`}>
        <div className="sidebar__top">
          <Brand />
          <button type="button" className="icon-button sidebar__close" onClick={() => onMobileNav(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <div className="sidebar__workspace">
          <span>{isClient ? 'Client workspace' : isDeliveryHead ? 'Delivery oversight' : 'Recruiter workspace'}</span>
          <strong>{user.company_name}</strong>
        </div>

        <nav className="sidebar__nav" aria-label="Primary">
          <span className="sidebar__label">Workspace</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                type="button"
                key={item.id}
                className={`nav-item ${active ? 'is-active' : ''}`}
                onClick={() => navigate(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {active && <span className="nav-item__dot" />}
              </button>
            );
          })}
        </nav>

        <div className="sidebar__footer">
          <span className="sidebar__note">
            {isClient
              ? 'Contact details stay masked. You decide who moves forward.'
              : 'AI never rejects a candidate. A recruiter verifies every CV before submission.'}
          </span>
          <span className="sidebar__version">Demo build · sample data only</span>
        </div>
      </aside>

      {mobileNavOpen && <button type="button" className="sidebar-backdrop" onClick={() => onMobileNav(false)} aria-label="Close menu" />}

      <div className="shell__main">
        <header className="topbar">
          <button type="button" className="icon-button topbar__menu" onClick={() => onMobileNav(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>

          <div className="topbar__title">
            <span>{meta.eyebrow}</span>
            <h1>{meta.title}</h1>
          </div>

          <div className="topbar__actions">
            {!isClient && requisitions.length > 0 && (
              <label className="requisition-picker">
                <Search size={15} />
                <select
                  value={currentRequisition?.id || ''}
                  onChange={(event) => onSelectRequisition(event.target.value)}
                  aria-label="Select requisition"
                >
                  {requisitions.map((req) => (
                    <option key={req.id} value={req.id}>
                      {req.title} · {req.client_company}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="requisition-picker__chevron" />
              </label>
            )}

            <div className="user-chip">
              <span className={`avatar avatar--${user.role}`}>
                {user.name
                  .split(' ')
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)}
              </span>
              <span className="user-chip__text">
                <strong>{user.name}</strong>
                <span>{ROLE_LABEL[user.role] || user.role}</span>
              </span>
              <button type="button" className="icon-button user-chip__logout" onClick={onLogout} aria-label="Sign out">
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </header>

        {isClient && requisitions.length > 1 && (
          <div className="client-role-bar">
            <span>Reviewing</span>
            <select
              value={currentRequisition?.id || ''}
              onChange={(event) => onSelectRequisition(event.target.value)}
              aria-label="Select requisition"
            >
              {requisitions.map((req) => (
                <option key={req.id} value={req.id}>
                  {req.title} · {req.client_company}
                </option>
              ))}
            </select>
          </div>
        )}

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
