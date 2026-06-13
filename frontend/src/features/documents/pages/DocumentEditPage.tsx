import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { documentsApi } from '../../../api';
import { LoadingSpinner } from '../../../shared/components';
import type { Document, UpdateDocumentRequest } from '../../../types';

/**
 * DocumentEditPage – Edit document metadata (file is not changed).
 */
export default function DocumentEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // ─── Form fields ──────────────────────────────────────────────────────
  const [documentNumber, setDocumentNumber] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('INCOMING');
  const [issuanceDate, setIssuanceDate] = useState('');
  const [sendingAgency, setSendingAgency] = useState('');
  const [urgencyLevel, setUrgencyLevel] = useState('NORMAL');
  const [confidentialityLevel, setConfidentialityLevel] = useState('NORMAL');
  const [category, setCategory] = useState('');

  // ─── Load existing document data ──────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    documentsApi
      .getById(Number(id))
      .then(({ data }) => {
        const d = data.data!;
        setDoc(d);
        setDocumentNumber(d.documentNumber);
        setTitle(d.title);
        setDescription(d.description || '');
        setType(d.type);
        setIssuanceDate(d.issuanceDate ? d.issuanceDate.split('T')[0] : '');
        setSendingAgency(d.sendingAgency || '');
        setUrgencyLevel(d.urgencyLevel);
        setConfidentialityLevel(d.confidentialityLevel);
        setCategory(d.category || '');
      })
      .catch(() => setError('Failed to load document'))
      .finally(() => setLoading(false));
  }, [id]);

  // ─── Submit handler ──────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !doc) return;

    setError('');
    setSuccessMsg('');
    setSaving(true);

    const updateData: UpdateDocumentRequest = {
      documentNumber: documentNumber.trim(),
      title: title.trim(),
      description: description.trim() || undefined,
      type: type as any,
      issuanceDate: issuanceDate ? new Date(issuanceDate).toISOString() : null,
      sendingAgency: sendingAgency.trim() || undefined,
      urgencyLevel: urgencyLevel as any,
      confidentialityLevel: confidentialityLevel as any,
      category: category.trim() || undefined,
    };

    try {
      await documentsApi.update(Number(id), updateData);
      setSuccessMsg('Document updated successfully!');
      // Navigate back to detail page after a short delay
      setTimeout(() => navigate(`/documents/${id}`), 1000);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to update document';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page-content"><LoadingSpinner /></div>;
  if (!doc) {
    return (
      <div className="page-content">
        <div className="alert alert-error">{error || 'Document not found'}</div>
        <button className="btn btn-secondary" onClick={() => navigate('/documents')}>← Back</button>
      </div>
    );
  }

  return (
    <>
      <div className="top-bar">
        <h1>✏️ Edit Document</h1>
        <button className="btn btn-secondary" onClick={() => navigate(`/documents/${id}`)}>
          ← Back to Details
        </button>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <h2>Edit: {doc.documentNumber}</h2>
          </div>
          <div className="card-body">
            {error && <div className="alert alert-error">{error}</div>}
            {successMsg && <div className="alert alert-success">{successMsg}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Document Number *</label>
                  <input
                    type="text"
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Title *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Document Type *</label>
                  <select value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="INCOMING">Incoming</option>
                    <option value="OUTGOING">Outgoing</option>
                    <option value="INTERNAL">Internal</option>
                    <option value="ARCHIVAL">Archival</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Issuance Date</label>
                  <input
                    type="date"
                    value={issuanceDate}
                    onChange={(e) => setIssuanceDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Sending Agency</label>
                  <input
                    type="text"
                    value={sendingAgency}
                    onChange={(e) => setSendingAgency(e.target.value)}
                    placeholder="Agency/organization name"
                  />
                </div>
                <div className="form-group">
                  <label>Urgency Level</label>
                  <select value={urgencyLevel} onChange={(e) => setUrgencyLevel(e.target.value)}>
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Confidentiality</label>
                  <select value={confidentialityLevel} onChange={(e) => setConfidentialityLevel(e.target.value)}>
                    <option value="NORMAL">Normal</option>
                    <option value="CONFIDENTIAL">Confidential</option>
                    <option value="TOP_SECRET">Top Secret</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Optional category"
                  />
                </div>
                <div className="form-group full-width">
                  <label>Description / Abstract</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief summary or abstract of the document..."
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid #dfe6e9',
                      borderRadius: 8,
                      fontSize: 14,
                      resize: 'vertical',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              </div>

              {/* ─── File Info (read-only) ─────────────────────────── */}
              {doc.originalFileName && (
                <div style={{
                  padding: 16,
                  background: '#f8f9fa',
                  borderRadius: 8,
                  marginTop: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  <span style={{ fontSize: 24 }}>📄</span>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{doc.originalFileName}</div>
                    <div style={{ fontSize: 12, color: '#636e72' }}>
                      File cannot be changed. Upload a new document to replace.
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Submit ────────────────────────────────────────── */}
              <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate(`/documents/${id}`)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                  style={{ width: 'auto' }}
                >
                  {saving ? 'Saving...' : '💾 Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
