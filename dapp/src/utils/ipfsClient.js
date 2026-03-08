/**
 * IPFS Client for Browser
 * Uploads encrypted votes to IPFS Desktop from the browser
 */

class IPFSClient {
  constructor(apiUrl = 'http://127.0.0.1:5001') {
    this.apiUrl = apiUrl;
  }

  /**
   * Check if IPFS is available
   */
  async isAvailable() {
    try {
      // Try the version endpoint first
      const response = await fetch(`${this.apiUrl}/api/v0/version`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        return true;
      }
      
      // If we get 403, IPFS is running but CORS might be blocking
      if (response.status === 403) {
        console.warn('IPFS is running but CORS configuration may need updating');
        // Return true because IPFS is actually running, just needs config
        return true;
      }
      
      return false;
    } catch (error) {
      // Network error - IPFS likely not running
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        console.error('IPFS Desktop not accessible. Is it running?');
        return false;
      }
      
      // CORS error - IPFS is running but needs configuration
      console.warn('IPFS connection issue (possibly CORS):', error.message);
      // Try to proceed anyway - the upload might work
      return true;
    }
  }

  /**
   * Upload JSON data to IPFS
   * @param {Object} data - Data to upload
   * @returns {Promise<string>} - IPFS CID
   */
  async uploadJSON(data) {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      
      const formData = new FormData();
      formData.append('file', blob, 'vote.json');
      
      const response = await fetch(`${this.apiUrl}/api/v0/add`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`IPFS upload failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      return result.Hash; // This is the CID
      
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
    try {
      const response = await fetch(`${this.apiUrl}/api/v0/pin/add?arg=${cid}`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`IPFS pin failed: ${response.statusText}`);
      }
      
      return true;
    } catch (error) {
      console.error('IPFS pin error:', error);
      // Don't throw - pinning is optional
      return false;
    }
  }

  /**
   * Retrieve JSON data from IPFS
   * @param {string} cid - IPFS CID
   * @returns {Promise<Object>} - Retrieved data
   */
  async retrieveJSON(cid) {
    try {
      const response = await fetch(`${this.apiUrl}/api/v0/cat?arg=${cid}`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`IPFS retrieval failed: ${response.statusText}`);
      }
      
      const text = await response.text();
      return JSON.parse(text);
      
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
    return `http://127.0.0.1:8080/ipfs/${cid}`;
  }
}

export default IPFSClient;
