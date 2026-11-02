import React, { useState } from 'react';
import { 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  Sparkles, 
  FileCheck2
} from 'lucide-react';
import { Requisition, User } from '../types';

interface BulkUploadProps {
  currentRequisition: Requisition | null;
  currentUser: User | null;
  onUploadSuccess?: () => void;
}

export default function BulkUpload({
  currentRequisition,
  currentUser,
  onUploadSuccess
}: BulkUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadResults, setUploadResults] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFiles.length || !currentRequisition) return;
    setIsUploading(true);
    setErrorMessage(null);
    setUploadResults(null);

    const formData = new FormData();
    formData.append('requisitionId', currentRequisition.id);
    selectedFiles.forEach((file) => {
      formData.append('cvFiles', file);
    });

    try {
      const res = await fetch('/api/candidates/upload', {
        method: 'POST',
        headers: {
          'x-user-id': currentUser?.id || 'usr_recruiter_priya'
        },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk upload failed');
      setUploadResults(data.results);
      if (onUploadSuccess) onUploadSuccess();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Helper to trigger 1-click batch upload of sample CV files
  const handleBatchSampleUpload = async () => {
    if (!currentRequisition) return;
    setIsUploading(true);
    setErrorMessage(null);
    setUploadResults(null);

    const samplePiles = [
      {
        filename: 'Ritika_Bansal_Senior_Java.txt',
        content: `RITIKA BANSAL | ritika.bansal92@gmail.com | +91 98112 45890
Senior Java Developer with 6.5 years experience in banking microservices.
Skills: Java 17, Spring Boot, Microservices, REST APIs, Kafka, Docker.
Notice Period: 60 days. Current CTC: 18 LPA, Expected: 22.5 LPA.`
      },
      {
        filename: 'Duplicate_Ritika_Bansal_CV.txt',
        content: `RITIKA BANSAL | ritika.bansal92@gmail.com | +91 98112 45890
Senior Java Developer with 6.5 years experience in banking microservices.
Skills: Java 17, Spring Boot, Microservices, REST APIs, Kafka, Docker.
Notice Period: 60 days. Current CTC: 18 LPA, Expected: 22.5 LPA.`
      },
      {
        filename: 'Kavita_Joshi_Java_Microservices.txt',
        content: `KAVITA JOSHI | kavita.joshi@outlook.com | +91 98100 77654
Java & Spring Boot Engineer with 5.0 years experience in Noida.
Key skills: Java, Spring Boot, Microservices, REST APIs, PostgreSQL.
Availability: Serving notice, 30 days remaining. Current CTC: 15 LPA, Expected: 19 LPA.`
      },
      {
        filename: 'Deepak_Sharma_Junior_Dev.txt',
        content: `DEEPAK SHARMA | deepak.sharma.dev@gmail.com | +91 99100 88221
Junior Java Developer with 2.5 years experience in REST APIs and basic Spring MVC.
Notice Period: 90 days. Current CTC: 6.0 LPA, Expected: 8.5 LPA.`
      }
    ];

    const formData = new FormData();
    formData.append('requisitionId', currentRequisition.id);

    samplePiles.forEach(s => {
      const blob = new Blob([s.content], { type: 'text/plain' });
      formData.append('cvFiles', blob, s.filename);
    });

    try {
      const res = await fetch('/api/candidates/upload', {
        method: 'POST',
        headers: {
          'x-user-id': currentUser?.id || 'usr_recruiter_priya'
        },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sample upload failed');
      setUploadResults(data.results);
      if (onUploadSuccess) onUploadSuccess();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>
              Bulk CV Upload & Parser
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
              Upload up to 500 CVs in PDF, DOCX, or TXT format. Automated parsing, SHA-256 duplicate detection, and scorecard evaluation.
            </p>
          </div>

          <button
            onClick={handleBatchSampleUpload}
            disabled={isUploading}
            className="btn btn-secondary btn-sm"
            title="1-Click batch upload of realistic sample CVs including duplicate edge case"
          >
            <Sparkles size={14} color="#2563eb" />
            <span>1-Click Batch Upload Sample Pool</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', fontSize: '0.85rem' }}>
          {errorMessage}
        </div>
      )}

      {/* Upload Drop Zone Card */}
      <div className="card" style={{ padding: '2rem' }}>
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${isDragOver ? '#2563eb' : '#cbd5e1'}`,
            borderRadius: '12px',
            padding: '3rem 1.5rem',
            textAlign: 'center',
            backgroundColor: isDragOver ? '#eff6ff' : '#f8fafc',
            transition: 'all 0.2s ease',
            cursor: 'pointer'
          }}
          onClick={() => {
            const el = document.getElementById('cv-file-input');
            if (el) el.click();
          }}
        >
          <input
            id="cv-file-input"
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          <UploadCloud size={48} color={isDragOver ? '#2563eb' : '#94a3b8'} style={{ margin: '0 auto 1rem auto' }} />

          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
            Choose CV files or drag & drop here
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 1rem 0' }}>
            Supports PDF, Word (.docx), and plain text files. Upload up to 500 files per requisition.
          </p>

          <button 
            type="button" 
            className="btn btn-primary btn-sm" 
            onClick={(e) => { 
              e.stopPropagation(); 
              const el = document.getElementById('cv-file-input');
              if (el) el.click();
            }}
          >
            Browse Files from Computer
          </button>
        </div>

        {/* Selected Files Count & Start Parsing Button */}
        {selectedFiles.length > 0 && (
          <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f1f5f9', padding: '0.75rem 1rem', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>
              {selectedFiles.length} file(s) selected for processing against {currentRequisition?.id}
            </span>
            <button
              onClick={handleUploadSubmit}
              disabled={isUploading}
              className="btn btn-success"
            >
              <FileCheck2 size={16} />
              <span>{isUploading ? 'Parsing & Scoring...' : `Process & Score ${selectedFiles.length} CVs`}</span>
            </button>
          </div>
        )}
      </div>

      {/* Upload & Parsing Results Section */}
      {uploadResults && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={20} color="#059669" />
            Batch Processing Report ({uploadResults.processed} Files)
          </h2>

          {/* Quick Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#ecfdf5', padding: '1rem', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
              <span style={{ fontSize: '0.75rem', color: '#065f46', fontWeight: 600, textTransform: 'uppercase' }}>Successfully Parsed & Scored</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#047857' }}>{uploadResults.successfulCandidates?.length || 0}</div>
            </div>

            <div style={{ background: '#fffbeb', padding: '1rem', borderRadius: '8px', border: '1px solid #fde68a' }}>
              <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 600, textTransform: 'uppercase' }}>Duplicates Detected & Flagged</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#b45309' }}>{uploadResults.duplicatesDetected?.length || 0}</div>
            </div>

            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Parsing Errors</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#475569' }}>{uploadResults.errors?.length || 0}</div>
            </div>
          </div>

          {/* Duplicate Detection Alerts Table */}
          {uploadResults.duplicatesDetected && uploadResults.duplicatesDetected.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#b45309', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertTriangle size={16} />
                Duplicate Profile Alerts:
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {uploadResults.duplicatesDetected.map((dup: any, idx: number) => (
                  <div 
                    key={idx}
                    style={{
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: '6px',
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.85rem'
                    }}
                  >
                    <div>
                      <strong>{dup.filename}</strong>: {dup.message}
                    </div>
                    <span style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#92400e', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                      {dup.duplicateType}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Successful Candidate Summary */}
          {uploadResults.successfulCandidates && uploadResults.successfulCandidates.length > 0 && (
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
                New Candidate Profiles Generated & AI Scored:
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {uploadResults.successfulCandidates.map((c: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 1rem',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '0.85rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{c.name}</span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>({c.candidateId})</span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>• File: {c.filename}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span className={`confidence-pill ${c.confidence}`}>
                        {c.confidence} confidence
                      </span>
                      <div className={`score-badge ${c.score >= 80 ? 'high' : (c.score >= 60 ? 'medium' : 'low')}`}>
                        {c.score}% Match
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
