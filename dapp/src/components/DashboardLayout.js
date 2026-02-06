import React from 'react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

export default function DashboardLayout({ 
  children, 
  walletAddress, 
  onLogout, 
  userRole,
  showSidebar = true 
}) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafbfc' }}>
      <Navbar 
        title="BlockVote"
        walletAddress={walletAddress}
        onLogout={onLogout}
        userRole={userRole}
      />
      
      {showSidebar && <Sidebar userRole={userRole} />}
      
      <main style={{
        marginLeft: showSidebar ? '70px' : '0',
        marginTop: '70px',
        minHeight: 'calc(100vh - 70px)',
        padding: '2.5rem',
        transition: 'margin-left 0.3s ease'
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
