import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import MessageAlert from '../components/MessageAlert';
import { getDeployedContract } from '../utils/contractUtils';

function OrganizerDashboard() {
  const navigate = useNavigate();
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
    nominationStartDate: '',
    nominationStartTime: '',
    nominationEndDate: '',
    nominationEndTime: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: ''
  });
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    initializeWeb3();
  }, []);

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
          id: id,
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
      // Combine date and time
      const nominationStartDateTime = new Date(`${newElection.nominationStartDate}T${newElection.nominationStartTime}`);
      const nominationEndDateTime = new Date(`${newElection.nominationEndDate}T${newElection.nominationEndTime}`);
      const startDateTime = new Date(`${newElection.startDate}T${newElection.startTime}`);
      const endDateTime = new Date(`${newElection.endDate}T${newElection.endTime}`);

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
        nominationStartDate: '',
        nominationStartTime: '',
        nominationEndDate: '',
        nominationEndTime: '',
        startDate: '',
        startTime: '',
        endDate: '',
        endTime: ''
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
    return new Date(timestamp * 1000).toLocaleString();
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
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa' }}>
      <Navbar walletAddress={walletAddress} userRole="organizer" onLogout={handleLogout} />
      <Sidebar userRole="organizer" />
      <MessageAlert message={message.text} type={message.type} />

      <div style={{ maxWidth: '1200px', margin: '0 auto', marginLeft: '90px', padding: '40px 20px', paddingTop: 'calc(70px + 40px)' }}>
        {/* Header */}
        <div style={{ marginBottom: '30px' }}>
          <div
            onClick={() => navigate('/')}
            style={{ cursor: 'pointer', display: 'inline-block' }}
          >
            <h1 style={{ color: '#1e3a5f', marginBottom: '10px' }}>Organizer Dashboard</h1>
          </div>
          {organizerInfo && (
            <p style={{ color: '#666', fontSize: '16px' }}>
              {organizerInfo.organizationName}
            </p>
          )}
        </div>

        {/* Statistics Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '20px',
          marginBottom: '30px'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '25px',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            borderLeft: '4px solid #1e3a5f'
          }}>
            <h3 style={{ color: '#666', fontSize: '14px', marginBottom: '10px' }}>
              Total Elections
            </h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#1e3a5f', margin: 0 }}>
              {statistics.totalElections}
            </p>
          </div>

          <div style={{
            backgroundColor: 'white',
            padding: '25px',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            borderLeft: '4px solid #28a745'
          }}>
            <h3 style={{ color: '#666', fontSize: '14px', marginBottom: '10px' }}>
              Active Elections
            </h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#28a745', margin: 0 }}>
              {statistics.activeElections}
            </p>
          </div>

          <div style={{
            backgroundColor: 'white',
            padding: '25px',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            borderLeft: '4px solid #ffc107'
          }}>
            <h3 style={{ color: '#666', fontSize: '14px', marginBottom: '10px' }}>
              Upcoming Elections
            </h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#ffc107', margin: 0 }}>
              {statistics.upcomingElections}
            </p>
          </div>

          <div style={{
            backgroundColor: 'white',
            padding: '25px',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            borderLeft: '4px solid #6c757d'
          }}>
            <h3 style={{ color: '#666', fontSize: '14px', marginBottom: '10px' }}>
              Completed Elections
            </h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#6c757d', margin: 0 }}>
              {statistics.completedElections}
            </p>
          </div>
        </div>

        {/* Create Election Button */}
        <div style={{ marginBottom: '30px' }}>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '12px 30px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            + Create New Election
          </button>
        </div>

        {/* Elections List */}
        <div style={{
          backgroundColor: 'white',
          padding: '30px',
          borderRadius: '10px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ color: '#1e3a5f', marginBottom: '20px' }}>My Elections</h2>

          {elections.length === 0 ? (
            <p style={{ color: '#666', textAlign: 'center', padding: '40px 0' }}>
              No elections created yet. Click "Create New Election" to get started.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {elections.map((election) => (
                <div
                  key={election.id}
                  style={{
                    padding: '20px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '8px',
                    transition: 'box-shadow 0.2s',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start',
                    marginBottom: '10px'
                  }}>
                    <div>
                      <h3 style={{ color: '#1e3a5f', marginBottom: '5px' }}>
                        {election.title}
                      </h3>
                      <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
                        ID: {election.id}
                      </p>
                    </div>
                    <span style={{
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      ...getStatusBadgeStyle(getElectionStatus(election))
                    }}>
                      {getElectionStatus(election)}
                    </span>
                  </div>

                  <p style={{ color: '#666', marginBottom: '15px' }}>
                    {election.description}
                  </p>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '15px',
                    fontSize: '14px',
                    color: '#666',
                    marginBottom: '15px'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>
                        <strong>Nomination Start:</strong>
                        <div>{formatDateTime(election.nominationStartTime)}</div>
                      </div>
                      <div>
                        <strong>Nomination End:</strong>
                        <div>{formatDateTime(election.nominationEndTime)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>
                        <strong>Voting Start:</strong>
                        <div>{formatDateTime(election.startTime)}</div>
                      </div>
                      <div>
                        <strong>Voting End:</strong>
                        <div>{formatDateTime(election.endTime)}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => navigate('/organizer-manage-election', { state: { electionId: election.id } })}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#1e3a5f',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600'
                      }}
                    >
                      Manage Candidates
                    </button>
                    <button
                      onClick={() => navigate('/election-results', { state: { electionId: election.id } })}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600'
                      }}
                    >
                      View Results
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Election Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1200
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '10px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h2 style={{ color: '#1e3a5f', marginBottom: '20px' }}>Create New Election</h2>

            <form onSubmit={handleCreateElection}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: '#333' }}>
                  Election Title *
                </label>
                <input
                  type="text"
                  value={newElection.title}
                  onChange={(e) => setNewElection({ ...newElection, title: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                  placeholder="e.g., National Presidential Election 2026"
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: '#333' }}>
                  Description *
                </label>
                <textarea
                  value={newElection.description}
                  onChange={(e) => setNewElection({ ...newElection, description: e.target.value })}
                  required
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                  placeholder="Describe the purpose and details of this election..."
                />
              </div>

              <h3 style={{ color: '#1e3a5f', fontSize: '16px', marginBottom: '15px', marginTop: '25px' }}>Nomination Period</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#333' }}>
                    Nomination Start Date *
                  </label>
                  <input
                    type="date"
                    value={newElection.nominationStartDate}
                    onChange={(e) => setNewElection({ ...newElection, nominationStartDate: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#333' }}>
                    Nomination Start Time *
                  </label>
                  <input
                    type="time"
                    value={newElection.nominationStartTime}
                    onChange={(e) => setNewElection({ ...newElection, nominationStartTime: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#333' }}>
                    Nomination End Date *
                  </label>
                  <input
                    type="date"
                    value={newElection.nominationEndDate}
                    onChange={(e) => setNewElection({ ...newElection, nominationEndDate: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#333' }}>
                    Nomination End Time *
                  </label>
                  <input
                    type="time"
                    value={newElection.nominationEndTime}
                    onChange={(e) => setNewElection({ ...newElection, nominationEndTime: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>

              <h3 style={{ color: '#1e3a5f', fontSize: '16px', marginBottom: '15px', marginTop: '25px' }}>Voting Period</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#333' }}>
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={newElection.startDate}
                    onChange={(e) => setNewElection({ ...newElection, startDate: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#333' }}>
                    Start Time *
                  </label>
                  <input
                    type="time"
                    value={newElection.startTime}
                    onChange={(e) => setNewElection({ ...newElection, startTime: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '30px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#333' }}>
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={newElection.endDate}
                    onChange={(e) => setNewElection({ ...newElection, endDate: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#333' }}>
                    End Time *
                  </label>
                  <input
                    type="time"
                    value={newElection.endTime}
                    onChange={(e) => setNewElection({ ...newElection, endTime: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '15px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewElection({
                      title: '',
                      description: '',
                      nominationStartDate: '',
                      nominationStartTime: '',
                      nominationEndDate: '',
                      nominationEndTime: '',
                      startDate: '',
                      startTime: '',
                      endDate: '',
                      endTime: ''
                    });
                  }}
                  style={{
                    padding: '10px 25px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 25px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                >
                  Create Election
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
