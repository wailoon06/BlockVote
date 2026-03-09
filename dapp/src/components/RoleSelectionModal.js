import React from 'react';

export default function RoleSelectionModal({ isOpen, onSelectRole, onClose }) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(30, 58, 95, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      backdropFilter: 'blur(4px)'
    }}
    onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          padding: '3rem',
          maxWidth: '520px',
          width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {onClose && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6c757d',
              padding: '0.25rem',
              lineHeight: 1,
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.color = '#1e3a5f'}
            onMouseLeave={(e) => e.target.style.color = '#6c757d'}
          >
            ×
          </button>
        )}
        <h2 style={{ 
          marginBottom: '0.75rem', 
          textAlign: 'center',
          color: '#1e3a5f',
          fontSize: '1.75rem',
          fontWeight: '600'
        }}>Select Your Role</h2>
        <p style={{ 
          color: '#6c757d', 
          textAlign: 'center', 
          marginBottom: '2.5rem',
          fontSize: '0.95rem',
          lineHeight: '1.6'
        }}>
          Choose how you want to participate in the blockchain voting system
        </p>
        
        <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
          <button
            onClick={() => onSelectRole('voter')}
            style={{
              padding: '1.75rem',
              backgroundColor: '#1e3a5f',
              color: 'white',
              border: '2px solid #1e3a5f',
              borderRadius: '0.625rem',
              cursor: 'pointer',
              fontSize: '1.1rem',
              fontWeight: '500',
              transition: 'all 0.2s',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 8px 16px rgba(30,58,95,0.2)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = 'none';
            }}
          >
            <div style={{ fontSize: '2.25rem', marginBottom: '0.75rem' }}>🗳️</div>
            <div style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>Register as Voter</div>
            <div style={{ fontSize: '0.875rem', opacity: 0.85, lineHeight: '1.5' }}>
              Participate in elections by casting your vote securely
            </div>
          </button>

          <button
            onClick={() => onSelectRole('candidate')}
            style={{
              padding: '1.75rem',
              backgroundColor: 'white',
              color: '#1e3a5f',
              border: '2px solid #e0e0e0',
              borderRadius: '0.625rem',
              cursor: 'pointer',
              fontSize: '1.1rem',
              fontWeight: '500',
              transition: 'all 0.2s',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.borderColor = '#1e3a5f';
              e.target.style.boxShadow = '0 8px 16px rgba(30,58,95,0.1)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.borderColor = '#e0e0e0';
              e.target.style.boxShadow = 'none';
            }}
          >
            <div style={{ fontSize: '2.25rem', marginBottom: '0.75rem' }}>👔</div>
            <div style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>Register as Candidate</div>
            <div style={{ fontSize: '0.875rem', opacity: 0.7, lineHeight: '1.5' }}>
              Run for office and represent your community
            </div>
          </button>

          <button
            onClick={() => onSelectRole('organizer')}
            style={{
              padding: '1.75rem',
              backgroundColor: 'white',
              color: '#1e3a5f',
              border: '2px solid #e0e0e0',
              borderRadius: '0.625rem',
              cursor: 'pointer',
              fontSize: '1.1rem',
              fontWeight: '500',
              transition: 'all 0.2s',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.borderColor = '#1e3a5f';
              e.target.style.boxShadow = '0 8px 16px rgba(30,58,95,0.1)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.borderColor = '#e0e0e0';
              e.target.style.boxShadow = 'none';
            }}
          >
            <div style={{ fontSize: '2.25rem', marginBottom: '0.75rem' }}>🏢</div>
            <div style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>Register as Organizer</div>
            <div style={{ fontSize: '0.875rem', opacity: 0.7, lineHeight: '1.5' }}>
              Create and manage elections for your organization
            </div>
          </button>

        </div>
      </div>
    </div>
  );
}
