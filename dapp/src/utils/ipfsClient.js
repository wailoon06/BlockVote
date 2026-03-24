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
    // List of public gateways known to have better CORS policies
    const gateways = [
      this.gateway,                           // Try the configured/Pinata primary first
      'https://cloudflare-ipfs.com/ipfs',     // Cloudflare
      'https://ipfs.io/ipfs',                 // Protocol Labs Official
      'https://dweb.link/ipfs'                // Protocol Labs dweb
    ];

    let lastError;

    // Loop through gateways until one succeeds
    for (const gw of gateways) {
      try {
        const response = await fetch(`${gw}/${cid}`);
        if (!response.ok) {
          throw new Error(`IPFS retrieval failed on ${gw}: ${response.statusText}`);
        }
        return await response.json(); // Success! Return the data
      } catch (error) {
        console.warn(`Gateway fallback - failed fetching from ${gw}:`, error.message);
        lastError = error;
      }
    }

    console.error('IPFS retrieval error on all fallback gateways:', lastError);
    throw new Error(`Failed to retrieve from IPFS: ${lastError.message}`);
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
