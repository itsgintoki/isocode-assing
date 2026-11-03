import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { Requisition, ToastMessage, User } from './types';
import { ApiError, authApi, requisitionApi } from './lib/api';
import { Brand } from './components/Brand';
import SignIn from './components/SignIn';
import AppShell from './components/AppShell';
import type { AppView } from './components/AppShell';
import { EmptyState } from './components/common';
import CandidatesPage from './pages/CandidatesPage';
import UploadPage from './pages/UploadPage';
import PipelinePage from './pages/PipelinePage';
import ScorecardPage from './pages/ScorecardPage';
import InsightsPage from './pages/InsightsPage';
import CompliancePage from './pages/CompliancePage';
import ClientShortlistPage from './pages/ClientShortlistPage';

const DEFAULT_VIEW: Record<User['role'], AppView> = {
  recruiter: 'candidates',
  client_hiring_manager: 'shortlist',
  delivery_head: 'insights'
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<User[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState('');
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [currentRequisition, setCurrentRequisition] = useState<Requisition | null>(null);
  const [activeView, setActiveView] = useState<AppView>('candidates');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastId = useRef(0);
  const timers = useRef<number[]>([]);

  const notify = useCallback((type: ToastMessage['type'], text: string) => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((current) => [...current, { id, type, text }].slice(-4));
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5000);
    timers.current.push(timer);
  }, []);

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    let active = true;

    authApi
      .demoAccounts()
      .then((data) => {
        if (active) setDemoAccounts(data.users || []);
      })
      .catch(() => {
        if (active) setDemoAccounts([]);
      })
      .finally(() => {
        if (active) setLoadingAccounts(false);
      });

    authApi
      .me()
      .then((data) => {
        if (active) setUser(data.user);
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) return;
        setBootError(error instanceof Error ? error.message : 'Could not reach the workspace API.');
      })
      .finally(() => {
        if (active) setBooting(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const loadRequisitions = useCallback(
    async (activeUser: User, preferredId?: string | null): Promise<Requisition[]> => {
      setDataLoading(true);
      setDataError('');
      try {
        const data = await requisitionApi.list();
        const list = data.requisitions || [];
        setRequisitions(list);
        setCurrentRequisition((previous) => {
          if (preferredId) return list.find((req) => req.id === preferredId) || list[0] || null;
          if (previous) return list.find((req) => req.id === previous.id) || list[0] || null;
          return list[0] || null;
        });
        setActiveView((previous) => {
          if (previous === 'shortlist' && activeUser.role === 'client_hiring_manager') return previous;
          if (previous === 'insights' && activeUser.role === 'delivery_head') return previous;
          if (previous !== 'candidates' && previous !== 'upload' && previous !== 'pipeline' && previous !== 'scorecard') {
            return DEFAULT_VIEW[activeUser.role];
          }
          if (activeUser.role === 'client_hiring_manager') return 'shortlist';
          return previous;
        });
        return list;
      } catch (error) {
        setDataError(error instanceof Error ? error.message : 'Could not load requisitions.');
        return [];
      } finally {
        setDataLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!user) {
      setRequisitions([]);
      setCurrentRequisition(null);
      return;
    }
    setActiveView(DEFAULT_VIEW[user.role]);
    loadRequisitions(user);
  }, [user, loadRequisitions]);

  const login = async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    setBootError('');
    setUser(data.user);
    setActiveView(DEFAULT_VIEW[data.user.role]);
    notify('success', `Signed in as ${data.user.name}.`);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Clear the local session state even if the network request fails.
    }
    setUser(null);
    setRequisitions([]);
    setCurrentRequisition(null);
    setToasts([]);
    setMobileNavOpen(false);
  };

  const refresh = useCallback(async () => {
    if (!user) return;
    setRefreshToken((value) => value + 1);
    await loadRequisitions(user);
  }, [user, loadRequisitions]);

  const selectRequisition = (id: string) => {
    const next = requisitions.find((requisition) => requisition.id === id);
    if (next) {
      setCurrentRequisition(next);
      setRefreshToken((value) => value + 1);
    }
  };

  const createdRequisition = async (id: string, title: string) => {
    if (!user) return;
    await loadRequisitions(user, id);
    setActiveView('candidates');
    setRefreshToken((value) => value + 1);
    notify('info', `${title} is ready for CVs.`);
  };

  if (booting) {
    return (
      <div className="boot-screen">
        <Brand />
        <span className="boot-spinner" aria-label="Loading workspace" />
        <p>Opening your hiring workspace…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        {bootError && (
          <div className="boot-error">
            <AlertTriangle size={17} /> {bootError}
          </div>
        )}
        <SignIn demoAccounts={demoAccounts} loadingAccounts={loadingAccounts} onLogin={login} />
        <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
      </>
    );
  }

  const renderContent = () => {
    if (user.role === 'client_hiring_manager') {
      if (!currentRequisition) {
        return (
          <EmptyState
            icon={AlertTriangle}
            title="No shortlist assigned"
            body="No requisitions for your company are available yet. Ask your recruiter to submit verified profiles."
          />
        );
      }
      return (
        <ClientShortlistPage
          requisition={currentRequisition}
          user={user}
          refreshToken={refreshToken}
          notify={notify}
        />
      );
    }

    if (!currentRequisition && activeView !== 'scorecard' && activeView !== 'insights') {
      return (
        <EmptyState
          icon={AlertTriangle}
          title="No requisition selected"
          body="Create a requisition and scorecard first, then add CVs and build the ranked list."
          action={
            <button type="button" className="button button--primary" onClick={() => setActiveView('scorecard')}>
              Create a requisition
            </button>
          }
        />
      );
    }

    switch (activeView) {
      case 'candidates':
        return currentRequisition ? (
          <CandidatesPage
            requisition={currentRequisition}
            user={user}
            refreshToken={refreshToken}
            onNavigate={setActiveView}
            onChanged={refresh}
            notify={notify}
          />
        ) : null;
      case 'upload':
        return currentRequisition ? (
          <UploadPage
            requisition={currentRequisition}
            onNavigate={setActiveView}
            onUploaded={refresh}
            notify={notify}
          />
        ) : null;
      case 'pipeline':
        return currentRequisition ? (
          <PipelinePage
            requisition={currentRequisition}
            user={user}
            refreshToken={refreshToken}
            onChanged={refresh}
            notify={notify}
          />
        ) : null;
      case 'scorecard':
        return (
          <ScorecardPage
            requisition={currentRequisition}
            onUpdated={refresh}
            onCreated={createdRequisition}
            notify={notify}
          />
        );
      case 'insights':
        return (
          <InsightsPage user={user} requisitions={requisitions} refreshToken={refreshToken} notify={notify} />
        );
      case 'compliance':
        return <CompliancePage refreshToken={refreshToken} notify={notify} />;
      default:
        return null;
    }
  };

  return (
    <>
      <AppShell
        user={user}
        requisitions={requisitions}
        currentRequisition={currentRequisition}
        activeView={activeView}
        mobileNavOpen={mobileNavOpen}
        onMobileNav={setMobileNavOpen}
        onSelectRequisition={selectRequisition}
        onNavigate={setActiveView}
        onLogout={logout}
      >
        {dataError && (
          <div className="inline-error inline-error--block">
            <AlertTriangle size={17} /> {dataError}
            <button type="button" className="text-button" onClick={() => loadRequisitions(user)}>
              Retry
            </button>
          </div>
        )}
        {dataLoading && requisitions.length === 0 ? (
          <div className="content-loading">
            <span className="skeleton skeleton--block" />
            <span className="skeleton skeleton--block" />
          </div>
        ) : (
          renderContent()
        )}
      </AppShell>
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    </>
  );
}

function ToastStack({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertTriangle : Info;
        return (
          <div className={`toast toast--${toast.type}`} key={toast.id}>
            <Icon size={18} />
            <span>{toast.text}</span>
            <button type="button" className="icon-button toast__close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
