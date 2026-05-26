import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import SharedNotebook from '../../components/notebook/SharedNotebook';

const NotebookFeature = () => {
  const navigate = useNavigate();
  const { activeHouse } = useAuth();

  return (
    <div style={{ padding: '32px', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
        <ArrowLeft size={28} style={{ cursor: 'pointer' }} onClick={() => navigate(-1)} />
        <div>
          <h2 style={{ margin: 0 }}>Shared Notebook</h2>
          <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>
            Real-time notes and sketches for {activeHouse?.name || 'this house'}.
          </p>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
        <SharedNotebook />
      </div>
    </div>
  );
};

export default NotebookFeature;
