import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import MessageAlert from '../components/MessageAlert';
import { getDeployedContract } from '../utils/contractUtils';

function OrganizerDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [contract, setContract] = useState(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [organizerInfo, setOrganizerInfo] = useState(null);
  const [elections, setElections] = useState([]);
  const [statistics, setStatistics] = useState({
    totalElections: 0,
    activeElections: 0,
    upcomingElections: 0,
    completedElections: 0
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newElection, setNewElection] = useState({
    title: '',
    description: '',
    nominationStartDateTime: '',
    nominationEndDateTime: '',
    startDateTime: '',
    endDateTime: ''
  });
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    initializeWeb3();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'create') {
      setShowCreateModal(true);
    }
  }, [location]);

  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => {
        setMessage({ text: '', type: '' });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const initializeWeb3 = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts',
        });

        setWalletAddress(accounts[0]);

        const { deployedContract } = await getDeployedContract();
        setContract(deployedContract);

        // Check if user is approved organizer
        await checkOrganizerStatus(deployedContract, accounts[0]);
        await loadElections(deployedContract, accounts[0]);
      } catch (error) {
        console.error('Error initializing Web3:', error);
        setMessage({ text: 'Failed to connect to wallet', type: 'error' });
      }
    } else {
      setMessage({
        text: 'Please install MetaMask to use this application',
        type: 'error',
      });
    }
  };

  const checkOrganizerStatus = async (contractInstance, address) => {
    try {
      const isRegistered = await contractInstance.methods
        .isOrganizerRegistered(address)
        .call();

      if (!isRegistered) {
        setMessage({ text: 'You are not registered as an organizer', type: 'error' });
        setTimeout(() => navigate('/'), 2000);
        return;
      }

      const isApproved = await contractInstance.methods
        .isOrganizer(address)
        .call();

      if (!isApproved) {
        setMessage({ text: 'Your organizer application is pending approval', type: 'warning' });
        setTimeout(() => navigate('/'), 2000);
        return;
      }

      // Get organizer info
      const info = await contractInstance.methods
        .getOrganizerInfo(address)
        .call();

      setOrganizerInfo({
        organizationName: info.organizationName,
        email: info.email,
        description: info.description,
        registeredAt: new Date(Number(info.registeredAt) * 1000).toLocaleDateString()
      });
    } catch (error) {
      console.error('Error checking organizer status:', error);
      setMessage({ text: 'Error verifying organizer status', type: 'error' });
    }
  };

  const loadElections = async (contractInstance, address) => {
    try {
      // Get all elections by this organizer
      const electionIds = await contractInstance.methods
        .getElectionsByOrganizer(address)
        .call();

      const electionData = [];
      let totalElections = 0;
      let activeElections = 0;
      let upcomingElections = 0;
      let completedElections = 0;

      for (let id of electionIds) {
        const info = await contractInstance.methods
          .getElectionInfo(id)
          .call();

        const election = {
          id: Number(id),
          title: info.title,
          description: info.description,
          nominationStartTime: Number(info.nominationStartTime),
          nominationEndTime: Number(info.nominationEndTime),
          startTime: Number(info.startTime),
          endTime: Number(info.endTime),
          isActive: info.isActive,
          createdAt: Number(info.createdAt)
        };

        electionData.push(election);
        totalElections++;

        const now = Math.floor(Date.now() / 1000);
        if (election.isActive && now >= election.startTime && now <= election.endTime) {
          activeElections++;
        } else if (now < election.startTime) {
          upcomingElections++;
        } else if (now > election.endTime) {
          completedElections++;
        }
      }

      // Sort by creation date (newest first)
      electionData.sort((a, b) => b.createdAt - a.createdAt);

      setElections(electionData);
      setStatistics({
        totalElections,
        activeElections,
        upcomingElections,
        completedElections
      });
    } catch (error) {
      console.error('Error loading elections:', error);
      setMessage({ text: 'Error loading elections', type: 'error' });
    }
  };

  const handleCreateElection = async (e) => {
    e.preventDefault();

    if (!contract || !walletAddress) {
      setMessage({ text: 'Please connect your wallet', type: 'error' });
      return;
    }

    try {
      // Parse datetime-local values
      const nominationStartDateTime = new Date(newElection.nominationStartDateTime);
      const nominationEndDateTime = new Date(newElection.nominationEndDateTime);
      const startDateTime = new Date(newElection.startDateTime);
      const endDateTime = new Date(newElection.endDateTime);

      // Convert to Unix timestamp (seconds)
      const nominationStartTimestamp = Math.floor(nominationStartDateTime.getTime() / 1000);
      const nominationEndTimestamp = Math.floor(nominationEndDateTime.getTime() / 1000);
      const startTimestamp = Math.floor(startDateTime.getTime() / 1000);
      const endTimestamp = Math.floor(endDateTime.getTime() / 1000);

      // Validate
      const now = Math.floor(Date.now() / 1000);
      if (nominationStartTimestamp <= now) {
        setMessage({ text: 'Nomination start time must be in the future', type: 'error' });
        return;
      }
      if (nominationEndTimestamp <= nominationStartTimestamp) {
        setMessage({ text: 'Nomination end time must be after nomination start time', type: 'error' });
        return;
      }
      if (startTimestamp <= nominationEndTimestamp) {
        setMessage({ text: 'Voting start time must be after nomination end time', type: 'error' });
        return;
      }
      if (endTimestamp <= startTimestamp) {
        setMessage({ text: 'Voting end time must be after start time', type: 'error' });
        return;
      }

      setMessage({ text: 'Creating election...', type: 'info' });

      await contract.methods
        .createElection(
          newElection.title,
          newElection.description,
          nominationStartTimestamp,
          nominationEndTimestamp,
          startTimestamp,
          endTimestamp
        )
        .send({ from: walletAddress });

      setMessage({ text: 'Election created successfully!', type: 'success' });
      setShowCreateModal(false);
      setNewElection({
        title: '',
        description: '',
        nominationStartDateTime: '',
        nominationEndDateTime: '',
        startDateTime: '',
        endDateTime: ''
      });

      // Reload elections
      await loadElections(contract, walletAddress);
    } catch (error) {
      console.error('Error creating election:', error);
      setMessage({ text: error.message || 'Failed to create election', type: 'error' });
    }
  };

  const getElectionStatus = (election) => {
    const now = Math.floor(Date.now() / 1000);
    
    if (now >= election.nominationStartTime && now <= election.nominationEndTime) {
      return 'Nominating';
    } else if (now >= election.startTime && now <= election.endTime) {
      return 'Voting Ongoing';
    } else if (now < election.nominationStartTime) {
      return 'Upcoming';
    } else if (now > election.endTime) {
      return 'Completed';
    } else if (now > election.nominationEndTime && now < election.startTime) {
      return 'Awaiting Voting';
    } else {
      return 'Draft';
    }
  };

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'Nominating':
        return { backgroundColor: '#17a2b8', color: 'white' };
      case 'Voting Ongoing':
        return { backgroundColor: '#28a745', color: 'white' };
      case 'Awaiting Voting':
        return { backgroundColor: '#fd7e14', color: 'white' };
      case 'Upcoming':
        return { backgroundColor: '#ffc107', color: '#333' };
      case 'Completed':
        return { backgroundColor: '#6c757d', color: 'white' };
      default:
        return { backgroundColor: '#e9ecef', color: '#333' };
    }
  };

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    const options = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    };
    return date.toLocaleString('en-US', options);
  };

  const handleLogout = () => {
    setWalletAddress('');
    setOrganizerInfo(null);
    setElections([]);
    setStatistics({
      totalElections: 0,
      activeElections: 0,
      upcomingElections: 0,
      completedElections: 0
    });
    navigate('/');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Navbar walletAddress={walletAddress} userRole="organizer" onLogout={handleLogout} />
      <Sidebar userRole="organizer" />
      <MessageAlert message={message.text} type={message.type} />

      <div style={{ margin: '0', marginLeft: '70px', padding: 'calc(70px + 40px) 30px 40px 30px', maxWidth: '1600px' }}>
        {/* Header Section */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
            <div>
              <h1 style={{ 
                color: '#1e293b', 
                marginBottom: '8px', 
                fontSize: '32px',
                fontWeight: '700',
                letterSpacing: '-0.02em'
              }}>
                Organizer Dashboard
              </h1>
              {organizerInfo && (
                <p style={{ 
                  color: '#64748b', 
                  fontSize: '18px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '20px' }}>🏢</span>
                  {organizerInfo.organizationName}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Statistics Cards with Icons */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px',
          marginBottom: '40px'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '28px',
            borderRadius: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)',
            border: '1px solid #e2e8f0',
            transition: 'transform 0.2s, box-shadow 0.2s',
            cursor: 'default'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)';
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ 
                  color: '#64748b', 
                  fontSize: '14px', 
                  marginBottom: '12px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Total Elections
                </p>
                <p style={{ 
                  fontSize: '40px', 
                  fontWeight: '800', 
                  color: '#1e293b', 
                  margin: 0,
                  lineHeight: '1'
                }}>
                  {statistics.totalElections}
                </p>
              </div>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '12px',
                backgroundColor: '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px'
              }}>
                📊
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'white',
            padding: '28px',
            borderRadius: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)',
            border: '1px solid #e2e8f0',
            transition: 'transform 0.2s, box-shadow 0.2s',
            cursor: 'default'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)';
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ 
                  color: '#64748b', 
                  fontSize: '14px', 
                  marginBottom: '12px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Active Elections
                </p>
                <p style={{ 
                  fontSize: '40px', 
                  fontWeight: '800', 
                  color: '#16a34a', 
                  margin: 0,
                  lineHeight: '1'
                }}>
                  {statistics.activeElections}
                </p>
              </div>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '12px',
                backgroundColor: '#f0fdf4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px'
              }}>
                ✅
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'white',
            padding: '28px',
            borderRadius: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)',
            border: '1px solid #e2e8f0',
            transition: 'transform 0.2s, box-shadow 0.2s',
            cursor: 'default'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)';
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ 
                  color: '#64748b', 
                  fontSize: '14px', 
                  marginBottom: '12px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Upcoming Elections
                </p>
                <p style={{ 
                  fontSize: '40px', 
                  fontWeight: '800', 
                  color: '#eab308', 
                  margin: 0,
                  lineHeight: '1'
                }}>
                  {statistics.upcomingElections}
                </p>
              </div>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '12px',
                backgroundColor: '#fefce8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px'
              }}>
                ⏳
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'white',
            padding: '28px',
            borderRadius: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)',
            border: '1px solid #e2e8f0',
            transition: 'transform 0.2s, box-shadow 0.2s',
            cursor: 'default'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)';
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ 
                  color: '#64748b', 
                  fontSize: '14px', 
                  marginBottom: '12px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Completed Elections
                </p>
                <p style={{ 
                  fontSize: '40px', 
                  fontWeight: '800', 
                  color: '#64748b', 
                  margin: 0,
                  lineHeight: '1'
                }}>
                  {statistics.completedElections}
                </p>
              </div>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '12px',
                backgroundColor: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px'
              }}>
                🏁
              </div>
            </div>
          </div>
        </div>

        {/* Elections List */}
        <div style={{
          backgroundColor: 'white',
          padding: '32px',
          borderRadius: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
            <h2 style={{ 
              color: '#1e293b', 
              margin: 0,
              fontSize: '24px',
              fontWeight: '700'
            }}>
              My Elections
            </h2>
          </div>

          {elections.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px 20px',
              color: '#64748b'
            }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>🗳️</div>
              <h3 style={{ 
                fontSize: '20px', 
                fontWeight: '600',
                marginBottom: '8px',
                color: '#475569'
              }}>
                No Elections Yet
              </h3>
              <p style={{ fontSize: '16px', marginBottom: '0' }}>
                Click "Create New Election" in the sidebar to get started.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {elections.map((election) => (
                <div
                  key={election.id}
                  style={{
                    padding: '24px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    transition: 'all 0.2s',
                    backgroundColor: '#fafafa'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)';
                    e.currentTarget.style.borderColor = '#cbd5e1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.borderColor = '#e2e8f0';
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start',
                    marginBottom: '16px',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div style={{ flex: 1, minWidth: '250px' }}>
                      <h3 style={{ 
                        color: '#1e293b', 
                        marginBottom: '8px',
                        fontSize: '20px',
                        fontWeight: '700'
                      }}>
                        {election.title}
                      </h3>
                      <p style={{ 
                        color: '#64748b', 
                        fontSize: '13px', 
                        margin: 0,
                        fontFamily: 'monospace',
                        fontWeight: '500'
                      }}>
                        ID: {election.id}
                      </p>
                    </div>
                    <span style={{
                      padding: '8px 16px',
                      borderRadius: '24px',
                      fontSize: '13px',
                      fontWeight: '700',
                      letterSpacing: '0.02em',
                      ...getStatusBadgeStyle(getElectionStatus(election))
                    }}>
                      {getElectionStatus(election)}
                    </span>
                  </div>

                  <p style={{ 
                    color: '#475569', 
                    marginBottom: '20px',
                    lineHeight: '1.6',
                    fontSize: '15px'
                  }}>
                    {election.description}
                  </p>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '20px',
                    padding: '20px',
                    backgroundColor: 'white',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    marginBottom: '20px'
                  }}>
                    <div>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        marginBottom: '8px'
                      }}>
                        <span style={{ fontSize: '18px' }}>📝</span>
                        <strong style={{ 
                          color: '#475569',
                          fontSize: '13px',
                          fontWeight: '600',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}>
                          Nomination Period
                        </strong>
                      </div>
                      <div style={{ color: '#1e293b', fontSize: '14px', marginLeft: '26px' }}>
                        <div style={{ marginBottom: '4px' }}>
                          <span style={{ fontWeight: '600' }}>Start:</span> {formatDateTime(election.nominationStartTime)}
                        </div>
                        <div>
                          <span style={{ fontWeight: '600' }}>End:</span> {formatDateTime(election.nominationEndTime)}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        marginBottom: '8px'
                      }}>
                        <span style={{ fontSize: '18px' }}>🗳️</span>
                        <strong style={{ 
                          color: '#475569',
                          fontSize: '13px',
                          fontWeight: '600',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}>
                          Voting Period
                        </strong>
                      </div>
                      <div style={{ color: '#1e293b', fontSize: '14px', marginLeft: '26px' }}>
                        <div style={{ marginBottom: '4px' }}>
                          <span style={{ fontWeight: '600' }}>Start:</span> {formatDateTime(election.startTime)}
                        </div>
                        <div>
                          <span style={{ fontWeight: '600' }}>End:</span> {formatDateTime(election.endTime)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => navigate('/organizer-manage-election', { state: { electionId: election.id } })}
                      style={{
                        padding: '12px 24px',
                        backgroundColor: '#1e293b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#0f172a';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#1e293b';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <span>👥</span>
                      Manage Candidates
                    </button>
                    <button
                      onClick={() => navigate('/election-results', { state: { electionId: election.id } })}
                      style={{
                        padding: '12px 24px',
                        backgroundColor: '#16a34a',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#15803d';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#16a34a';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <span>📊</span>
                      View Results
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Enhanced Create Election Modal */}
      {showCreateModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1200,
            padding: '20px',
            backdropFilter: 'blur(4px)'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCreateModal(false);
            }
          }}
        >
          <div style={{
            backgroundColor: 'white',
            padding: '40px',
            borderRadius: '20px',
            maxWidth: '700px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
          }}>
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ 
                color: '#1e293b', 
                marginBottom: '8px',
                fontSize: '28px',
                fontWeight: '800',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <span style={{ fontSize: '32px' }}>🗳️</span>
                Create New Election
              </h2>
              <p style={{ 
                color: '#64748b',
                fontSize: '15px',
                margin: 0
              }}>
                Set up your election with nomination and voting periods
              </p>
            </div>

            <form onSubmit={handleCreateElection}>
              {/* Basic Information */}
              <div style={{ 
                marginBottom: '32px',
                padding: '24px',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: '1px solid #e2e8f0'
              }}>
                <h3 style={{ 
                  color: '#1e293b',
                  fontSize: '16px',
                  fontWeight: '700',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>📋</span>
                  Basic Information
                </h3>
                
                <div style={{ marginBottom: '20px' }}>
                  <label 
                    htmlFor="election-title"
                    style={{ 
                      display: 'block', 
                      marginBottom: '8px', 
                      color: '#334155',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    Election Title <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    id="election-title"
                    type="text"
                    value={newElection.title}
                    onChange={(e) => setNewElection({ ...newElection, title: e.target.value })}
                    required
                    aria-required="true"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '15px',
                      transition: 'border-color 0.2s',
                      outline: 'none',
                      fontFamily: 'inherit'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                    placeholder="e.g., National Presidential Election 2026"
                  />
                </div>

                <div>
                  <label 
                    htmlFor="election-description"
                    style={{ 
                      display: 'block', 
                      marginBottom: '8px', 
                      color: '#334155',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    Description <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <textarea
                    id="election-description"
                    value={newElection.description}
                    onChange={(e) => setNewElection({ ...newElection, description: e.target.value })}
                    required
                    aria-required="true"
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '15px',
                      resize: 'vertical',
                      transition: 'border-color 0.2s',
                      outline: 'none',
                      fontFamily: 'inherit',
                      lineHeight: '1.5'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                    placeholder="Describe the purpose and details of this election..."
                  />
                </div>
              </div>

              {/* Timeline Section */}
              <div style={{ 
                marginBottom: '32px',
                padding: '24px',
                backgroundColor: '#fefce8',
                borderRadius: '12px',
                border: '1px solid #fde047'
              }}>
                <h3 style={{ 
                  color: '#854d0e',
                  fontSize: '16px',
                  fontWeight: '700',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>⏱️</span>
                  Timeline Overview
                </h3>
                <div style={{ 
                  fontSize: '13px',
                  color: '#713f12',
                  lineHeight: '1.6'
                }}>
                  <p style={{ margin: '0 0 8px 0' }}>
                    <strong>1. Nomination Period:</strong> Candidates can apply during this time
                  </p>
                  <p style={{ margin: '0 0 8px 0' }}>
                    <strong>2. Review Period:</strong> Between nomination end and voting start
                  </p>
                  <p style={{ margin: '0' }}>
                    <strong>3. Voting Period:</strong> Approved voters cast their votes
                  </p>
                </div>
              </div>

              {/* Nomination Period */}
              <div style={{ 
                marginBottom: '24px',
                padding: '24px',
                backgroundColor: '#eff6ff',
                borderRadius: '12px',
                border: '1px solid #bfdbfe'
              }}>
                <h3 style={{ 
                  color: '#1e40af',
                  fontSize: '16px',
                  fontWeight: '700',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>📝</span>
                  Nomination Period
                </h3>
                
                <div style={{ marginBottom: '16px' }}>
                  <label 
                    htmlFor="nomination-start"
                    style={{ 
                      display: 'block', 
                      marginBottom: '8px', 
                      color: '#1e3a8a',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    Start Date & Time <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    id="nomination-start"
                    type="datetime-local"
                    value={newElection.nominationStartDateTime}
                    onChange={(e) => setNewElection({ ...newElection, nominationStartDateTime: e.target.value })}
                    required
                    aria-required="true"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #bfdbfe',
                      borderRadius: '8px',
                      fontSize: '15px',
                      transition: 'border-color 0.2s',
                      outline: 'none',
                      fontFamily: 'inherit',
                      backgroundColor: 'white'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#bfdbfe'}
                  />
                </div>

                <div>
                  <label 
                    htmlFor="nomination-end"
                    style={{ 
                      display: 'block', 
                      marginBottom: '8px', 
                      color: '#1e3a8a',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    End Date & Time <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    id="nomination-end"
                    type="datetime-local"
                    value={newElection.nominationEndDateTime}
                    onChange={(e) => setNewElection({ ...newElection, nominationEndDateTime: e.target.value })}
                    required
                    aria-required="true"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #bfdbfe',
                      borderRadius: '8px',
                      fontSize: '15px',
                      transition: 'border-color 0.2s',
                      outline: 'none',
                      fontFamily: 'inherit',
                      backgroundColor: 'white'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#bfdbfe'}
                  />
                </div>
              </div>

              {/* Voting Period */}
              <div style={{ 
                marginBottom: '32px',
                padding: '24px',
                backgroundColor: '#f0fdf4',
                borderRadius: '12px',
                border: '1px solid #bbf7d0'
              }}>
                <h3 style={{ 
                  color: '#166534',
                  fontSize: '16px',
                  fontWeight: '700',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>🗳️</span>
                  Voting Period
                </h3>
                
                <div style={{ marginBottom: '16px' }}>
                  <label 
                    htmlFor="voting-start"
                    style={{ 
                      display: 'block', 
                      marginBottom: '8px', 
                      color: '#14532d',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    Start Date & Time <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    id="voting-start"
                    type="datetime-local"
                    value={newElection.startDateTime}
                    onChange={(e) => setNewElection({ ...newElection, startDateTime: e.target.value })}
                    required
                    aria-required="true"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #bbf7d0',
                      borderRadius: '8px',
                      fontSize: '15px',
                      transition: 'border-color 0.2s',
                      outline: 'none',
                      fontFamily: 'inherit',
                      backgroundColor: 'white'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#22c55e'}
                    onBlur={(e) => e.target.style.borderColor = '#bbf7d0'}
                  />
                </div>

                <div>
                  <label 
                    htmlFor="voting-end"
                    style={{ 
                      display: 'block', 
                      marginBottom: '8px', 
                      color: '#14532d',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    End Date & Time <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    id="voting-end"
                    type="datetime-local"
                    value={newElection.endDateTime}
                    onChange={(e) => setNewElection({ ...newElection, endDateTime: e.target.value })}
                    required
                    aria-required="true"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #bbf7d0',
                      borderRadius: '8px',
                      fontSize: '15px',
                      transition: 'border-color 0.2s',
                      outline: 'none',
                      fontFamily: 'inherit',
                      backgroundColor: 'white'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#22c55e'}
                    onBlur={(e) => e.target.style.borderColor = '#bbf7d0'}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ 
                display: 'flex', 
                gap: '12px', 
                justifyContent: 'flex-end',
                borderTop: '1px solid #e2e8f0',
                paddingTop: '24px'
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewElection({
                      title: '',
                      description: '',
                      nominationStartDateTime: '',
                      nominationEndDateTime: '',
                      startDateTime: '',
                      endDateTime: ''
                    });
                  }}
                  style={{
                    padding: '12px 32px',
                    backgroundColor: 'white',
                    color: '#64748b',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '15px',
                    fontWeight: '600',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8fafc';
                    e.currentTarget.style.borderColor = '#cbd5e1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.borderColor = '#e2e8f0';
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '12px 32px',
                    backgroundColor: '#16a34a',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '15px',
                    fontWeight: '700',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 6px -1px rgba(22, 163, 74, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#15803d';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(22, 163, 74, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#16a34a';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(22, 163, 74, 0.3)';
                  }}
                >
                  ✓ Create Election
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrganizerDashboard;
