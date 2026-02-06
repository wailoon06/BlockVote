import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getDeployedContract } from '../utils/contractUtils';
import MessageAlert from '../components/MessageAlert';
import Navbar from '../components/Navbar';

export default function OrganizerManageElection() {
  const navigate = useNavigate();
  const location = useLocation();
  const electionId = location.state?.electionId;
  
  const [walletAddress, setWalletAddress] = useState('');
  const [election, setElection] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [applicantDetails, setApplicantDetails] = useState({});
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);

  useEffect(() => {
    if (!electionId) {
      setMessage('No election ID provided');
      setMessageType('danger');
      setTimeout(() => navigate('/organizer-dashboard'), 2000);
      return;
    }
    initialize();
  }, [electionId]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage('');
        setMessageType('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const initialize = async () => {
    try {
      if (typeof window.ethereum !== 'undefined') {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts',
        });

        if (accounts.length > 0) {
          const address = accounts[0];
          setWalletAddress(address);

          const { deployedContract } = await getDeployedContract();

          // Check if user is approved organizer
          const isApproved = await deployedContract.methods.isOrganizer(address).call();
          
          if (!isApproved) {
            setMessage('Only approved organizers can manage elections');
            setMessageType('danger');
            setTimeout(() => navigate('/'), 2000);
            return;
          }

          // Load election info
          const info = await deployedContract.methods.getElectionInfo(electionId).call();
          
          // Verify this organizer owns this election
          if (info.organizer.toLowerCase() !== address.toLowerCase()) {
            setMessage('You can only manage your own elections');
            setMessageType('danger');
            setTimeout(() => navigate('/organizer-dashboard'), 2000);
            return;
          }

          setElection({
            id: electionId,
            title: info.title,
            description: info.description,
            nominationStartTime: Number(info.nominationStartTime),
            nominationEndTime: Number(info.nominationEndTime),
            startTime: Number(info.startTime),
            endTime: Number(info.endTime),
            organizer: info.organizer
          });

          await loadApplicants(deployedContract);
        }
      } else {
        setMessage('Please install MetaMask!');
        setMessageType('danger');
      }
    } catch (error) {
      console.error('Error initializing:', error);
      setMessage('Failed to initialize: ' + error.message);
      setMessageType('danger');
    } finally {
      setLoading(false);
    }
  };

  const loadApplicants = async (contract) => {
    try {
      const applicantsList = await contract.methods.getElectionCandidateApplicants(electionId).call();
      setApplicants(applicantsList);

      // Load details for each applicant
      const details = {};
      for (const address of applicantsList) {
        const candidateInfo = await contract.methods.getCandidateInfo(address).call();
        const status = await contract.methods.candidateApplicationStatus(electionId, address).call();
        
        details[address] = {
          name: candidateInfo.name,
          email: candidateInfo.email,
          party: candidateInfo.party,
          manifesto: candidateInfo.manifesto,
          status: Number(status)
        };
      }
      setApplicantDetails(details);
    } catch (error) {
      console.error('Error loading applicants:', error);
      setMessage('Failed to load applicants: ' + error.message);
      setMessageType('danger');
    }
  };

  const handleApprove = async (candidateAddress) => {
    if (!walletAddress) return;

    setProcessing(candidateAddress);
    setMessage('Approving candidate...');
    setMessageType('info');

    try {
      const { deployedContract } = await getDeployedContract();
      
      await deployedContract.methods
        .approveCandidateForElection(electionId, candidateAddress)
        .send({ from: walletAddress });

      setMessage('Candidate approved successfully!');
      setMessageType('success');
      
      // Reload applicants
      await loadApplicants(deployedContract);
    } catch (error) {
      console.error('Error approving:', error);
      setMessage('Failed to approve: ' + error.message);
      setMessageType('danger');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (candidateAddress) => {
    if (!walletAddress) return;

    setProcessing(candidateAddress);
    setMessage('Rejecting candidate...');
    setMessageType('info');

    try {
      const { deployedContract } = await getDeployedContract();
      
      await deployedContract.methods
        .rejectCandidateForElection(electionId, candidateAddress)
        .send({ from: walletAddress });

      setMessage('Candidate rejected');
      setMessageType('success');
      
      // Reload applicants
      await loadApplicants(deployedContract);
    } catch (error) {
      console.error('Error rejecting:', error);
      setMessage('Failed to reject: ' + error.message);
      setMessageType('danger');
    } finally {
      setProcessing(null);
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 0: return 'Not Applied';
      case 1: return 'Pending Review';
      case 2: return 'Approved';
      case 3: return 'Rejected';
      default: return 'Unknown';
    }
  };

  const getStatusStyle = (status) => {
    const baseStyle = {
      padding: '0.5rem 1rem',
      borderRadius: '8px',
      fontSize: '0.875rem',
      fontWeight: '600',
      display: 'inline-block'
    };

    switch (status) {
      case 1: return { ...baseStyle, backgroundColor: '#fff3cd', color: '#856404' };
      case 2: return { ...baseStyle, backgroundColor: '#d4edda', color: '#155724' };
      case 3: return { ...baseStyle, backgroundColor: '#f8d7da', color: '#721c24' };
      default: return { ...baseStyle, backgroundColor: '#e9ecef', color: '#6c757d' };
    }
  };

  const formatDateTime = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const handleLogout = () => {
    setWalletAddress('');
    setElection(null);
    navigate('/');
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
          <div style={{ fontSize: '1.25rem', color: '#6c757d' }}>Loading election details...</div>
        </div>
      </div>
    );
  }

  const pendingCount = Object.values(applicantDetails).filter(d => d.status === 1).length;
  const approvedCount = Object.values(applicantDetails).filter(d => d.status === 2).length;
  const rejectedCount = Object.values(applicantDetails).filter(d => d.status === 3).length;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa' }}>
      <Navbar 
        title="BlockVote - Manage Election Candidates"
        walletAddress={walletAddress}
        onLogout={handleLogout}
        userRole="organizer"
      />

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '3rem 1.5rem', paddingTop: 'calc(70px + 3rem)' }}>
        <button
          onClick={() => navigate('/organizer-dashboard')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'transparent',
            color: '#1e3a5f',
            border: '1px solid #1e3a5f',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.95rem',
            marginBottom: '2rem',
            fontWeight: '600',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#1e3a5f';
            e.target.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = 'transparent';
            e.target.style.color = '#1e3a5f';
          }}
        >
          ← Back to Dashboard
        </button>

        {election && (
          <>
            <div style={{ marginBottom: '3rem' }}>
              <h1 style={{ fontSize: '2.5rem', fontWeight: '600', marginBottom: '0.75rem', color: '#1e3a5f' }}>
                {election.title}
              </h1>
              <p style={{ color: '#6c757d', fontSize: '1rem', marginBottom: '1.5rem' }}>
                {election.description}
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1rem',
                padding: '1.5rem',
                backgroundColor: 'white',
                borderRadius: '0.75rem',
                border: '1px solid #e8e8e8'
              }}>
                <div>
                  <div style={{ color: '#6c757d', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                    Nomination Period
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#1e3a5f' }}>
                    {formatDateTime(election.nominationStartTime)} - {formatDateTime(election.nominationEndTime)}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#6c757d', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                    Voting Period
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#1e3a5f' }}>
                    {formatDateTime(election.startTime)} - {formatDateTime(election.endTime)}
                  </div>
                </div>
              </div>
            </div>

            <MessageAlert message={message} type={messageType} onClose={() => setMessage('')} />

            {/* Statistics Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1.5rem',
              marginBottom: '3rem'
            }}>
              <div style={{
                backgroundColor: 'white',
                padding: '2rem',
                borderRadius: '0.75rem',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                border: '1px solid #e8e8e8'
              }}>
                <div style={{ color: '#6c757d', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Total Applications
                </div>
                <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#1e3a5f' }}>
                  {applicants.length}
                </div>
              </div>

              <div style={{
                backgroundColor: 'white',
                padding: '2rem',
                borderRadius: '0.75rem',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                border: '1px solid #e8e8e8'
              }}>
                <div style={{ color: '#6c757d', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Pending Review
                </div>
                <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#ffc107' }}>
                  {pendingCount}
                </div>
              </div>

              <div style={{
                backgroundColor: 'white',
                padding: '2rem',
                borderRadius: '0.75rem',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                border: '1px solid #e8e8e8'
              }}>
                <div style={{ color: '#6c757d', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Approved
                </div>
                <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#28a745' }}>
                  {approvedCount}
                </div>
              </div>

              <div style={{
                backgroundColor: 'white',
                padding: '2rem',
                borderRadius: '0.75rem',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                border: '1px solid #e8e8e8'
              }}>
                <div style={{ color: '#6c757d', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Rejected
                </div>
                <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#dc3545' }}>
                  {rejectedCount}
                </div>
              </div>
            </div>

            {/* Applicants List */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              padding: '2rem',
              border: '1px solid #e8e8e8'
            }}>
              <h2 style={{ color: '#1e3a5f', fontSize: '1.5rem', marginBottom: '2rem' }}>
                Candidate Applications
              </h2>

              {applicants.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📭</div>
                  <h3 style={{ marginBottom: '0.5rem' }}>No Applications Yet</h3>
                  <p>Candidates can apply during the nomination period.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '1.5rem' }}>
                  {applicants.map((address) => {
                    const details = applicantDetails[address];
                    if (!details) return null;

                    return (
                      <div
                        key={address}
                        style={{
                          padding: '1.5rem',
                          backgroundColor: '#f8fafc',
                          borderRadius: '0.75rem',
                          border: '1px solid #e2e8f0'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                          <div>
                            <h3 style={{ color: '#1e3a5f', fontSize: '1.25rem', marginBottom: '0.5rem' }}>
                              {details.name}
                            </h3>
                            <div style={{ color: '#6c757d', fontSize: '0.875rem', fontFamily: 'monospace' }}>
                              {address}
                            </div>
                          </div>
                          <span style={getStatusStyle(details.status)}>
                            {getStatusText(details.status)}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                          <div>
                            <div style={{ color: '#6c757d', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Email</div>
                            <div style={{ fontWeight: '600', color: '#1e3a5f' }}>{details.email}</div>
                          </div>
                          <div>
                            <div style={{ color: '#6c757d', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Party</div>
                            <div style={{ fontWeight: '600', color: '#1e3a5f' }}>{details.party}</div>
                          </div>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                          <div style={{ color: '#6c757d', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Manifesto</div>
                          <div style={{ 
                            padding: '1rem', 
                            backgroundColor: 'white', 
                            borderRadius: '0.5rem',
                            border: '1px solid #e2e8f0',
                            lineHeight: '1.6',
                            color: '#475569'
                          }}>
                            {details.manifesto}
                          </div>
                        </div>

                        {details.status === 1 && (
                          <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                              onClick={() => handleApprove(address)}
                              disabled={processing === address}
                              style={{
                                flex: 1,
                                padding: '0.875rem',
                                backgroundColor: processing === address ? '#6c757d' : '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.5rem',
                                cursor: processing === address ? 'not-allowed' : 'pointer',
                                fontSize: '1rem',
                                fontWeight: '600',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                if (processing !== address) e.target.style.backgroundColor = '#218838';
                              }}
                              onMouseLeave={(e) => {
                                if (processing !== address) e.target.style.backgroundColor = '#28a745';
                              }}
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => handleReject(address)}
                              disabled={processing === address}
                              style={{
                                flex: 1,
                                padding: '0.875rem',
                                backgroundColor: processing === address ? '#6c757d' : '#dc3545',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.5rem',
                                cursor: processing === address ? 'not-allowed' : 'pointer',
                                fontSize: '1rem',
                                fontWeight: '600',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                if (processing !== address) e.target.style.backgroundColor = '#c82333';
                              }}
                              onMouseLeave={(e) => {
                                if (processing !== address) e.target.style.backgroundColor = '#dc3545';
                              }}
                            >
                              ✗ Reject
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
