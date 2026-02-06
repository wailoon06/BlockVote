import React from 'react';

/**
 * Component Showcase - Examples of all UI components in the design system
 * This file serves as a reference for developers
 */

export default function ComponentShowcase() {
  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: '700', marginBottom: '0.5rem', color: '#1e293b' }}>
          BlockVote Design System
        </h1>
        <p style={{ fontSize: '1.125rem', color: '#64748b' }}>
          Component showcase and usage examples
        </p>
      </div>

      {/* Buttons Section */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem', color: '#1e293b' }}>
          Buttons
        </h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary">Primary Button</button>
          <button className="btn btn-secondary">Secondary Button</button>
          <button className="btn btn-outline">Outline Button</button>
          <button className="btn btn-primary" disabled>Disabled Button</button>
        </div>
      </section>

      {/* Cards Section */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem', color: '#1e293b' }}>
          Cards
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Card Title</h3>
              <p className="card-subtitle">Card subtitle text</p>
            </div>
            <p style={{ color: '#64748b' }}>
              This is a standard card component with header and content area.
              Cards are the primary container for content in the dashboard.
            </p>
          </div>

          <div className="stat-card">
            <div className="stat-label">Total Users</div>
            <div className="stat-value">1,234</div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#10b981' }}>
              ↑ 12% from last month
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Active Elections</div>
            <div className="stat-value">42</div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#ef4444' }}>
              ↓ 3% from last month
            </div>
          </div>
        </div>
      </section>

      {/* Badges Section */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem', color: '#1e293b' }}>
          Badges
        </h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="badge badge-success">Verified</span>
          <span className="badge badge-warning">Pending</span>
          <span className="badge badge-error">Rejected</span>
          <span className="badge badge-info">In Review</span>
        </div>
      </section>

      {/* Alerts Section */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem', color: '#1e293b' }}>
          Alerts
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="alert alert-success">
            <span>✓</span>
            <span>Your vote has been recorded successfully!</span>
          </div>
          <div className="alert alert-warning">
            <span>⚠</span>
            <span>Please verify your identity before participating.</span>
          </div>
          <div className="alert alert-error">
            <span>✗</span>
            <span>Transaction failed. Please try again.</span>
          </div>
          <div className="alert alert-info">
            <span>ℹ</span>
            <span>New election starting in 2 hours.</span>
          </div>
        </div>
      </section>

      {/* Forms Section */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem', color: '#1e293b' }}>
          Form Elements
        </h2>
        <div className="card" style={{ maxWidth: '600px' }}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Enter your full name"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input 
              type="email" 
              className="form-input" 
              placeholder="you@example.com"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Message</label>
            <textarea 
              className="form-input" 
              rows="4"
              placeholder="Enter your message..."
            ></textarea>
          </div>
          <button className="btn btn-primary">Submit Form</button>
        </div>
      </section>

      {/* Table Section */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem', color: '#1e293b' }}>
          Data Table
        </h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Party</th>
                <th>Votes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>John Doe</td>
                <td>Independent</td>
                <td>1,234</td>
                <td><span className="badge badge-success">Verified</span></td>
              </tr>
              <tr>
                <td>Jane Smith</td>
                <td>Democratic</td>
                <td>987</td>
                <td><span className="badge badge-success">Verified</span></td>
              </tr>
              <tr>
                <td>Bob Johnson</td>
                <td>Republican</td>
                <td>756</td>
                <td><span className="badge badge-warning">Pending</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Color Palette */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem', color: '#1e293b' }}>
          Color Palette
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          {[
            { name: 'Primary Cyan', color: '#06b6d4' },
            { name: 'Soft Blue', color: '#60a5fa' },
            { name: 'Success Green', color: '#10b981' },
            { name: 'Warning Amber', color: '#f59e0b' },
            { name: 'Error Red', color: '#ef4444' },
            { name: 'Text Primary', color: '#1e293b' },
            { name: 'Text Secondary', color: '#64748b' },
            { name: 'Border', color: '#e2e8f0' }
          ].map((item, idx) => (
            <div key={idx} style={{
              padding: '1rem',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              backgroundColor: 'white'
            }}>
              <div style={{
                width: '100%',
                height: '80px',
                backgroundColor: item.color,
                borderRadius: '8px',
                marginBottom: '0.75rem',
                border: '1px solid #e2e8f0'
              }}></div>
              <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b' }}>
                {item.name}
              </div>
              <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#64748b', marginTop: '0.25rem' }}>
                {item.color}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Loading State */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem', color: '#1e293b' }}>
          Loading States
        </h2>
        <div className="loading">
          <div className="spinner"></div>
        </div>
      </section>

    </div>
  );
}
