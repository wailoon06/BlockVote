import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Navbar({ title, walletAddress, onLogout, userRole, onConnect, isConnected }) {
  const navigate = useNavigate();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  return (
    <nav style={{ 
      backgroundColor: '#ffffff',
      padding: '0',
      color: '#1e293b',
      borderBottom: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1100,
      height: '70px'
    }}>
      <div style={{ 
        maxWidth: '100%',
        height: '100%',
        margin: '0 auto', 
        padding: '0 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        {/* Logo/Brand */}
        <div 
          onClick={() => navigate('/')}
          style={{ 
            fontSize: '1.5rem', 
            fontWeight: '700',
            background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}
        >
          <span style={{ fontSize: '1.75rem' }}>🗳️</span>
          {title || 'BlockVote'}
        </div>

        {/* Right Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {/* Connect Wallet Button - Only show when not connected */}
          {!walletAddress && onConnect && (
            <button
              onClick={onConnect}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '0.95rem',
                fontWeight: '600',
                background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(6, 182, 212, 0.3)',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(6, 182, 212, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(6, 182, 212, 0.3)';
              }}
            >
              🔗 Connect Wallet
            </button>
          )}
          
          {/* Search Bar (optional - can be enabled later) */}
          {walletAddress && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#f8fafc',
              borderRadius: '12px',
              padding: '0.5rem 1rem',
              border: '1px solid #e2e8f0',
              minWidth: '300px'
            }}>
              <span style={{ color: '#94a3b8', marginRight: '0.5rem' }}>🔍</span>
              <input 
                type="text"
                placeholder="Search..."
                style={{
                  border: 'none',
                  backgroundColor: 'transparent',
                  outline: 'none',
                  width: '100%',
                  color: '#1e293b',
                  fontSize: '0.95rem'
                }}
              />
            </div>
          )}

          {/* Wallet Address & Profile */}
          {walletAddress && (
            <>
              {/* Wallet Address Badge */}
              <div style={{
                backgroundColor: '#e0f2fe',
                padding: '0.625rem 1rem',
                borderRadius: '12px',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                color: '#0c4a6e',
                fontWeight: '600',
                border: '1px solid #bae6fd',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                }}></div>
                {walletAddress.substring(0, 6)}...{walletAddress.substring(38)}
              </div>

              {/* User Profile Menu */}
              <div style={{ position: 'relative' }}>
                <div
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'white',
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    border: '2px solid #e0f2fe',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 8px rgba(6, 182, 212, 0.2)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(6, 182, 212, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(6, 182, 212, 0.2)';
                  }}
                >
                  {userRole === 'admin' ? '👑' : userRole === 'organizer' ? '🏢' : '👤'}
                </div>

                {/* Dropdown Menu */}
                {showProfileMenu && (
                  <div style={{
                    position: 'absolute',
                    top: '55px',
                    right: 0,
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
                    border: '1px solid #e2e8f0',
                    minWidth: '220px',
                    overflow: 'hidden',
                    zIndex: 1000
                  }}>
                    <div style={{
                      padding: '1rem',
                      borderBottom: '1px solid #f1f5f9'
                    }}>
                      <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>
                        Logged in as
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#1e293b', textTransform: 'capitalize' }}>
                        {userRole || 'User'}
                      </div>
                    </div>
                    
                    <div style={{ padding: '0.5rem' }}>
                      {userRole === 'candidate' && (
                        <div
                          onClick={() => {
                            navigate('/candidate-my-elections');
                            setShowProfileMenu(false);
                          }}
                          style={{
                            padding: '0.75rem 1rem',
                            cursor: 'pointer',
                            borderRadius: '8px',
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            color: '#475569',
                            fontSize: '0.95rem'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f1f5f9';
                            e.currentTarget.style.color = '#1e293b';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = '#475569';
                          }}
                        >
                          📋 My Elections
                        </div>
                      )}
                      <div
                        onClick={() => {
                          navigate('/profile');
                          setShowProfileMenu(false);
                        }}
                        style={{
                          padding: '0.75rem 1rem',
                          cursor: 'pointer',
                          borderRadius: '8px',
                          fontSize: '0.95rem',
                          color: '#475569',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f8fafc';
                          e.currentTarget.style.color = '#1e293b';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = '#475569';
                        }}
                      >
                        👤 My Profile
                      </div>
                      
                      <div
                        onClick={() => {
                          navigate('/settings');
                          setShowProfileMenu(false);
                        }}
                        style={{
                          padding: '0.75rem 1rem',
                          cursor: 'pointer',
                          borderRadius: '8px',
                          fontSize: '0.95rem',
                          color: '#475569',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f8fafc';
                          e.currentTarget.style.color = '#1e293b';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = '#475569';
                        }}
                      >
                        ⚙️ Settings
                      </div>
                    </div>

                    <div style={{
                      padding: '0.5rem',
                      borderTop: '1px solid #f1f5f9'
                    }}>
                      <div
                        onClick={() => {
                          onLogout();
                          setShowProfileMenu(false);
                        }}
                        style={{
                          padding: '0.75rem 1rem',
                          cursor: 'pointer',
                          borderRadius: '8px',
                          fontSize: '0.95rem',
                          color: '#ef4444',
                          fontWeight: '500',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#fef2f2';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        🚪 Disconnect Wallet
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pulse Animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </nav>
  );
}

