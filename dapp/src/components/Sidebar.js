import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Sidebar({ userRole }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const getMenuItems = () => {
    if (userRole === 'admin') {
      return [
        { icon: '🏠', label: 'Dashboard', path: '/admin' },
        { icon: '👥', label: 'All Users', path: '/users' },
        { icon: '✓', label: 'Verify Voters', path: '/verify' },
        { icon: '🗳️', label: 'Elections', path: '/elections' },
        { icon: '⚙️', label: 'Settings', path: '/settings' }
      ];
    } else if (userRole === 'organizer') {
      return [
        { icon: '🏠', label: 'Dashboard', path: '/organizer-dashboard' },
        { icon: '➕', label: 'Create Election', path: '/organizer-dashboard?action=create' }
      ];
    } else if (userRole === 'candidate') {
      return [
        { icon: '🏠', label: 'Dashboard', path: '/candidate-dashboard' },
        { icon: '📝', label: 'Apply Elections', path: '/candidate-elections' }
      ];
    } else if (userRole === 'voter') {
      return [
        { icon: '🏠', label: 'Dashboard', path: '/voter-dashboard' },
        { icon: '🗳️', label: 'Vote in Elections', path: '/voter-elections' }
      ];
    } else if (userRole === 'trustee') {
      return [
        { icon: '🏠', label: 'Dashboard', path: '/trustee-dashboard' }
      ];
    }
    return [
      { icon: '🏠', label: 'Home', path: '/' }
    ];
  };

  const menuItems = getMenuItems();

  return (
    <aside
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      style={{
        position: 'fixed',
        left: 0,
        top: '70px',
        height: 'calc(100vh - 70px)',
        width: isExpanded ? '240px' : '70px',
        backgroundColor: '#ffffff',
        borderRight: '1px solid #e5e7eb',
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 1000,
        overflow: 'hidden',
        boxShadow: isExpanded ? '2px 0 8px rgba(0, 0, 0, 0.05)' : 'none'
      }}
    >
      <nav style={{ padding: '1rem 0' }}>
        {menuItems.map((item, index) => {
          const [itemPath, itemQuery] = item.path.split('?');
          const isActive = location.pathname === itemPath &&
            location.search === (itemQuery ? '?' + itemQuery : '');
          return (
            <div
              key={index}
              onClick={() => navigate(item.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.875rem 1.25rem',
                margin: '0.25rem 0.5rem',
                cursor: 'pointer',
                borderRadius: '12px',
                backgroundColor: isActive ? '#e0f2fe' : 'transparent',
                color: isActive ? '#0c4a6e' : '#64748b',
                fontWeight: isActive ? '600' : '500',
                fontSize: '0.95rem',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = '#f1f5f9';
                  e.currentTarget.style.color = '#334155';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#64748b';
                }
              }}
            >
              <span style={{ 
                fontSize: '1.5rem',
                minWidth: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {item.icon}
              </span>
              <span style={{
                marginLeft: '1rem',
                opacity: isExpanded ? 1 : 0,
                transition: 'opacity 0.3s ease'
              }}>
                {item.label}
              </span>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
