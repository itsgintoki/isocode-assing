import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import RankedCandidates from './pages/RankedCandidates';
import ScorecardIntake from './pages/ScorecardIntake';
import BulkUpload from './pages/BulkUpload';
import PipelineKanban from './pages/PipelineKanban';
import ClientPortal from './pages/ClientPortal';
import DeliveryHeadAudit from './pages/DeliveryHeadAudit';
import DPDPCompliance from './pages/DPDPCompliance';
import CandidateModal from './components/CandidateModal';
import { User, Requisition, Candidate } from './types';

export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [currentRequisition, setCurrentRequisition] = useState<Requisition | null>(null);
  const [activeTab, setActiveTab] = useState<string>('candidates');
  const [selectedCandidateForModal, setSelectedCandidateForModal] = useState<Candidate | null>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 1. Initial Load of Users & Requisitions
  const loadInitialData = async () => {
    try {
      const [usersRes, reqRes] = await Promise.all([
        fetch('/api/auth/users'),
        fetch('/api/requisitions')
      ]);

      const usersData = await usersRes.json();
      const reqData = await reqRes.json();

      setUsers(usersData.users || []);
      // Default to recruiter Priya
      const defaultUser = (usersData.users || []).find((u: User) => u.role === 'recruiter') || usersData.users?.[0];
      setCurrentUser(defaultUser);

      setRequisitions(reqData.requisitions || []);
      setCurrentRequisition(reqData.requisitions?.[0] || null);
    } catch (err) {
      console.error('Initialization error:', err);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // 2. Handle Role Switch
  const handleSwitchUser = (userId: string) => {
    const selected = users.find(u => u.id === userId);
    if (!selected) return;
    setCurrentUser(selected);

    // If switched to client hiring manager, tailor view
    if (selected.role === 'client_hiring_manager') {
      setActiveTab('client');
      // Auto-select requisition matching client's company
      const matchingReq = requisitions.find(r => r.client_company === selected.company_name);
      if (matchingReq) {
        setCurrentRequisition(matchingReq);
      }
    } else if (selected.role === 'delivery_head') {
      setActiveTab('calibration');
    }

    setToastMessage(`Switched user profile to ${selected.name} (${selected.role.replace(/_/g, ' ')})`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 3. Handle Requisition Selection
  const handleSelectRequisition = (reqId: string) => {
    const found = requisitions.find(r => r.id === reqId);
    if (found) {
      setCurrentRequisition(found);
    }
  };

  // 4. Refresh Requisition List after update
  const handleRequisitionUpdated = async () => {
    try {
      const res = await fetch('/api/requisitions', {
        headers: { 'x-user-id': currentUser?.id || 'usr_recruiter_priya' }
      });
      const data = await res.json();
      setRequisitions(data.requisitions || []);
      if (currentRequisition) {
        const updatedCurrent = (data.requisitions || []).find((r: Requisition) => r.id === currentRequisition.id);
        if (updatedCurrent) setCurrentRequisition(updatedCurrent);
      }
    } catch (e) {
      console.error('Error refreshing requisitions:', e);
    }
  };

  // 5. 1-Click Reset Sample Data
  const handleResetData = async () => {
    if (!window.confirm('Reset database to clean Company A sample state?')) return;
    setIsResetting(true);
    try {
      const res = await fetch('/api/admin/reset-sample-data', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      setToastMessage('Database successfully reset and re-seeded with realistic sample data!');
      setTimeout(() => setToastMessage(null), 4000);
      await loadInitialData();
    } catch (err: any) {
      alert(`Reset error: ${err.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="app-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '80px',
          right: '24px',
          zIndex: 9999,
          background: '#0f172a',
          color: '#ffffff',
          padding: '0.75rem 1.25rem',
          borderRadius: '8px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          fontSize: '0.85rem',
          fontWeight: 600,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          {toastMessage}
        </div>
      )}

      {/* Main Navbar */}
      <Navbar
        currentUser={currentUser}
        users={users}
        onSwitchUser={handleSwitchUser}
        currentRequisition={currentRequisition}
        requisitions={requisitions}
        onSelectRequisition={handleSelectRequisition}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onResetData={handleResetData}
        isResetting={isResetting}
      />

      {/* Active Tab View */}
      <main className="main-content">
        {activeTab === 'candidates' && (
          <RankedCandidates
            currentRequisition={currentRequisition}
            currentUser={currentUser}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'scorecard' && (
          <ScorecardIntake
            currentRequisition={currentRequisition}
            currentUser={currentUser}
            onRequisitionUpdated={handleRequisitionUpdated}
          />
        )}

        {activeTab === 'upload' && (
          <BulkUpload
            currentRequisition={currentRequisition}
            currentUser={currentUser}
            onUploadSuccess={() => {
              setActiveTab('candidates');
              handleRequisitionUpdated();
            }}
          />
        )}

        {activeTab === 'pipeline' && (
          <PipelineKanban
            currentRequisition={currentRequisition}
            currentUser={currentUser}
            onOpenCandidate={(cand: Candidate) => setSelectedCandidateForModal(cand)}
          />
        )}

        {activeTab === 'client' && (
          <ClientPortal
            currentRequisition={currentRequisition}
            currentUser={currentUser}
            onSwitchUser={handleSwitchUser}
          />
        )}

        {activeTab === 'calibration' && (
          <DeliveryHeadAudit
            currentUser={currentUser}
          />
        )}

        {activeTab === 'dpdp' && (
          <DPDPCompliance
            currentUser={currentUser}
          />
        )}
      </main>

      {/* Modal if candidate opened from external page like Kanban */}
      {selectedCandidateForModal && (
        <CandidateModal
          candidate={selectedCandidateForModal}
          evaluation={selectedCandidateForModal}
          requisition={currentRequisition}
          currentUser={currentUser}
          onClose={() => setSelectedCandidateForModal(null)}
          onVerifyCandidate={async (candidateId: string, notes: string) => {
            await fetch(`/api/candidates/${candidateId}/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser?.id || 'usr_recruiter_priya' },
              body: JSON.stringify({ requisitionId: currentRequisition?.id, notes })
            });
            handleRequisitionUpdated();
          }}
          onSubmitToClient={async (candidateId: string) => {
            await fetch('/api/pipeline/move', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser?.id || 'usr_recruiter_priya' },
              body: JSON.stringify({ requisitionId: currentRequisition?.id, candidateId, targetStage: 'submitted_to_client' })
            });
            handleRequisitionUpdated();
          }}
        />
      )}
    </div>
  );
}
