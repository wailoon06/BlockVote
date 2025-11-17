import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import VoterRegisterContract from "../Voter_Register.json";

export default function VotersList() {
  const navigate = useNavigate();
  const [voters, setVoters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalVoters, setTotalVoters] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');

  useEffect(() => {
    loadVoters();
  }, []);

  const goHome = () => {
    // Clear state and redirect to home
    navigate('/', { replace: true });
  };

  const loadVoters = async () => {
    setLoading(true);
    setError('');

    try {
      // Check if MetaMask is available
      if (typeof window.ethereum === 'undefined') {
        throw new Error('MetaMask not found');
      }

      // Import Web3
      const Web3 = (await import('web3')).default;
      const web3 = new Web3(window.ethereum);
      
      const chainId = await web3.eth.getChainId();
      const networkId = await web3.eth.net.getId();
      const possibleIds = [chainId, networkId, 5777, 1337];
      let deployedNetwork = null;
      for (const id of possibleIds) {
        if (VoterRegisterContract.networks[id]) {
          deployedNetwork = VoterRegisterContract.networks[id];
          break;
        }
      }
      if (!deployedNetwork) {
        throw new Error('Contract not deployed on this network!');
      }

      const contract = new web3.eth.Contract(
        VoterRegisterContract.abi,
        deployedNetwork.address
      );

      // Get total number of registered voters
      const total = await contract.methods.getTotalRegisteredVoters().call();
      setTotalVoters(parseInt(total));

      // Get all registered addresses
      const addresses = await contract.methods.getAllRegisteredAddresses().call();
      
      // Get voter details for each address
      const voterPromises = addresses.map(async (address) => {
        const info = await contract.methods.getVoterInfo(address).call();
        return {
          wallet: address,
          name: info.name,
          email: info.email,
          status: info.status,
          registeredAt: new Date(parseInt(info.registeredAt) * 1000)
        };
      });

      const votersData = await Promise.all(voterPromises);
      setVoters(votersData);

    } catch (err) {
      console.error('Error loading voters:', err);
      setError(err.message || 'Failed to load voters');
    }

    setLoading(false);
  };

  const filteredVoters = voters.filter(voter => {
    const matchesSearch = 
      voter.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      voter.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      voter.wallet.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'ALL' || voter.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadgeStyle = (status) => {
    const baseStyle = {
      padding: '0.25rem 0.75rem',
      borderRadius: '0.25rem',
      fontSize: '0.875rem',
      fontWeight: '500'
    };

    if (status === 'VERIFIED') {
      return {
        ...baseStyle,
        backgroundColor: '#d1e7dd',
        color: '#0f5132'
      };
    } else {
      return {
        ...baseStyle,
        backgroundColor: '#fff3cd',
        color: '#664d03'
      };
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      {/* Navigation */}
      <nav style={{ 
        backgroundColor: '#0d6efd', 
        padding: '1rem 0',
        color: 'white'
      }}>
        <div style={{ 
          maxWidth: '1200px', 
          margin: '0 auto', 
          padding: '0 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
            VoteChain - Registered Voters
          </div>
          <button 
            onClick={goHome}
            style={{
              backgroundColor: 'white',
              color: '#0d6efd',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Back to Home
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1rem' }}>
        {/* Header Stats */}
        <div style={{ 
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 0.125rem 0.25rem rgba(0,0,0,0.075)',
          padding: '1.5rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ marginBottom: '0.5rem' }}>Registered Voters</h2>
              <p style={{ color: '#6c757d', margin: 0 }}>
                Total: {totalVoters} voter{totalVoters !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={loadVoters}
              style={{
                backgroundColor: '#0d6efd',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 0.125rem 0.25rem rgba(0,0,0,0.075)',
          padding: '1.5rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', minWidth: '250px' }}>
              <input
                type="text"
                placeholder="Search by name, email, or wallet address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ced4da',
                  borderRadius: '0.25rem',
                  fontSize: '1rem'
                }}
              />
            </div>
            <div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #ced4da',
                  borderRadius: '0.25rem',
                  fontSize: '1rem',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">All Status</option>
                <option value="VERIFIED">Verified</option>
                <option value="PENDING_VERIFICATION">Pending</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            backgroundColor: '#f8d7da',
            color: '#842029',
            padding: '1rem',
            borderRadius: '0.25rem',
            marginBottom: '1rem'
          }}>
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 0.125rem 0.25rem rgba(0,0,0,0.075)',
            padding: '3rem',
            textAlign: 'center'
          }}>
            <p>Loading voters...</p>
          </div>
        ) : (
          <>
            {/* Results Count */}
            <div style={{ marginBottom: '1rem', color: '#6c757d' }}>
              Showing {filteredVoters.length} of {totalVoters} voters
            </div>

            {/* Voters Table */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              boxShadow: '0 0.125rem 0.25rem rgba(0,0,0,0.075)',
              overflow: 'hidden'
            }}>
              {filteredVoters.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#6c757d' }}>
                  No voters found
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Name</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Email</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Wallet Address</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Status</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Registered At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVoters.map((voter, index) => (
                        <tr 
                          key={voter.wallet}
                          style={{ 
                            borderBottom: '1px solid #dee2e6',
                            backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa'
                          }}
                        >
                          <td style={{ padding: '1rem' }}>{voter.name}</td>
                          <td style={{ padding: '1rem' }}>{voter.email}</td>
                          <td style={{ 
                            padding: '1rem',
                            fontFamily: 'monospace',
                            fontSize: '0.875rem'
                          }}>
                            {voter.wallet.substring(0, 6)}...{voter.wallet.substring(38)}
                          </td>
                          <td style={{ padding: '1rem' }}>
                            <span style={getStatusBadgeStyle(voter.status)}>
                              {voter.status === 'VERIFIED' ? 'Verified' : 'Pending'}
                            </span>
                          </td>
                          <td style={{ padding: '1rem', color: '#6c757d' }}>
                            {voter.registeredAt.toLocaleDateString()} {voter.registeredAt.toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}