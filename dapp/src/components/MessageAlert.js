import React from 'react';

export default function MessageAlert({ message, type, onClose }) {
  if (!message) return null;

  const getStyles = () => {
    // Check if message is about MetaMask confirmation
    const isMetaMaskMessage = message.toLowerCase().includes('metamask') || message.includes('Step 3/3');
    
    switch(type) {
      case 'success':
        return {
          backgroundColor: '#d4edda',
          color: '#155724',
          borderColor: '#28a745',
          icon: '✅',
          animate: true
        };
      case 'info':
        return {
          backgroundColor: isMetaMaskMessage ? '#fff3cd' : '#e8f4f8',
          color: isMetaMaskMessage ? '#856404' : '#1e3a5f',
          borderColor: isMetaMaskMessage ? '#ffc107' : '#2c5282',
          icon: isMetaMaskMessage ? '👛' : 'ℹ️',
          animate: isMetaMaskMessage
        };
      case 'danger':
        return {
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderColor: '#dc3545',
          icon: '⚠️',
          animate: false
        };
      default:
        return {
          backgroundColor: '#f8f9fa',
          color: '#495057',
          borderColor: '#dee2e6',
          icon: 'ℹ️',
          animate: false
        };
    }
  };

  const styles = getStyles();

  return (
    <div style={{
      backgroundColor: styles.backgroundColor,
      color: styles.color,
      padding: '1.25rem 1.75rem',
      borderRadius: '0.5rem',
      marginBottom: '1.5rem',
      position: 'relative',
      border: `2px solid ${styles.borderColor}`,
      fontSize: '0.95rem',
      lineHeight: '1.6',
      boxShadow: styles.animate ? '0 4px 12px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.05)',
      animation: styles.animate ? 'pulse 2s ease-in-out infinite' : 'none',
      fontWeight: '500'
    }}>
      <div style={{ 
        paddingRight: onClose ? '2rem' : '0',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem'
      }}>
        <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{styles.icon}</span>
        <span style={{ flex: 1 }}>{message}</span>
      </div>
      {onClose && (
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            right: '1rem',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            fontSize: '1.75rem',
            cursor: 'pointer',
            color: 'inherit',
            opacity: '0.7',
            lineHeight: '1',
            padding: '0',
            width: '24px',
            height: '24px'
          }}
          onMouseEnter={(e) => e.target.style.opacity = '1'}
          onMouseLeave={(e) => e.target.style.opacity = '0.7'}
        >
          ×
        </button>
      )}
      <style>
        {`
          @keyframes pulse {
            0%, 100% {
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }
            50% {
              box-shadow: 0 4px 20px rgba(0,0,0,0.25);
            }
          }
        `}
      </style>
    </div>
  );
}
