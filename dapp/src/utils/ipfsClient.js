/**
 * IPFS Client for Browser using Pinata
 * Uploads encrypted votes to Pinata from the browser
 */

class IPFSClient {
  constructor() {
    this.jwt = import.meta.env.VITE_PINATA_JWT;
    this.gateway = import.meta.env.VITE_PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs';
  }

  /**
   * Check if IPFS / Pinata is available
   */
  async isAvailable() {
    if (!this.jwt) {
      console.warn('Pinata JWT is not defined in environment variables');
      return false;
    }

    try {
      const response = await fetch('https://api.pinata.cloud/data/testAuthentication', {
        headers: {
          'Authorization': `Bearer ${this.jwt}`
        }
      });
      return response.ok;
    } catch (error) {
      console.error('Pinata authentication failed or network error:', error);
      return false;
    }
  }

  /**
   * Upload JSON data to IPFS
   * @param {Object} data - Data to upload
   * @returns {Promise<string>} - IPFS CID
   */
  async uploadJSON(data) {
    if (!this.jwt) {
      throw new Error('Pinata JWT is missing. Check VITE_PINATA_JWT in .env');
    }

    try {
      const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.jwt}`
        },
        body: JSON.stringify({
          pinataContent: data,
          pinataMetadata: { name: 'vote.json' }
        })
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      return result.IpfsHash; // Pinata returns the CID as IpfsHash
    } catch (error) {
      console.error('IPFS upload error:', error);
      throw new Error(`Failed to upload to IPFS: ${error.message}`);
    }
  }

  /**
   * Pin content to ensure it stays available
   * @param {string} cid - IPFS CID to pin
   */
  async pin(cid) {
    // Pinata's pinJSONToIPFS automatically pins the content
    return true;
  }

  /**
   * Retrieve JSON data from IPFS
   * @param {string} cid - IPFS CID
   * @returns {Promise<Object>} - Retrieved data
   */
  async retrieveJSON(cid) {
    try {
      const response = await fetch(`${this.gateway}/${cid}`);
      if (!response.ok) {
        throw new Error(`IPFS retrieval failed: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('IPFS retrieval error:', error);
      throw new Error(`Failed to retrieve from IPFS: ${error.message}`);
    }
  }

  /**
   * Get gateway URL for viewing content
   * @param {string} cid - IPFS CID
   * @returns {string} - Gateway URL
   */
  getGatewayUrl(cid) {
    return `${this.gateway}/${cid}`;
  }
}

export default IPFSClient;
