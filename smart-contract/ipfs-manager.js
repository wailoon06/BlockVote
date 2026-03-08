/**
 * IPFS Manager for Phase 2
 * 
 * Handles uploading and retrieving encrypted votes to/from IPFS Desktop.
 * Uses IPFS HTTP API (default port 5001)
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

class IPFSManager {
    constructor(ipfsApiUrl = 'http://127.0.0.1:5001') {
        this.ipfsApiUrl = ipfsApiUrl;
        this.ipfs = null;
        this.initPromise = this.initializeIPFS();
    }

    async initializeIPFS() {
        try {
            // Use axios with IPFS API for better Node.js compatibility
            
            try {
                // Test connection using axios
                const response = await axios.post(
                    'http://127.0.0.1:5001/api/v0/version',
                    null,
                    { timeout: 5000 }
                );
                
                // Use axios with form-data for better Node.js compatibility
                this.ipfs = {
                    add: async (content) => {
                        const formData = new FormData();
                        formData.append('file', Buffer.from(content), {
                            filename: 'vote.json',
                            contentType: 'application/json'
                        });
                        
                        const res = await axios.post(
                            'http://127.0.0.1:5001/api/v0/add',
                            formData,
                            {
                                headers: formData.getHeaders(),
                                maxContentLength: Infinity,
                                maxBodyLength: Infinity
                            }
                        );
                        
                        return { path: res.data.Hash, size: res.data.Size };
                    },
                    cat: async function* (cid) {
                        const res = await axios.post(
                            `http://127.0.0.1:5001/api/v0/cat?arg=${cid}`,
                            null,
                            { responseType: 'text' }
                        );
                        yield Buffer.from(res.data);
                    },
                    pin: {
                        add: async (cid) => {
                            await axios.post(
                                `http://127.0.0.1:5001/api/v0/pin/add?arg=${cid}`
                            );
                        }
                    },
                    id: async () => {
                        const res = await axios.post('http://127.0.0.1:5001/api/v0/id');
                        return res.data;
                    }
                };
                
                console.log('✅ IPFS client initialized successfully (using axios)');
                return true;
            } catch (testError) {
                console.warn('⚠️  IPFS connection test failed');
                console.warn(`   Trying to connect to: http://127.0.0.1:5001`);
                console.warn(`   Error: ${testError.message}`);
                console.warn('');
                console.warn('   Troubleshooting:');
                console.warn('   • Is IPFS Desktop running?');
                console.warn('   • Check Settings → IPFS Config → "API": "/ip4/127.0.0.1/tcp/5001"');
                console.warn('   • Try restarting IPFS Desktop');
                this.ipfs = null;
                return false;
            }
        } catch (error) {
            console.warn('⚠️  IPFS client initialization failed:', error.message);
            this.ipfs = null;
            return false;
        }
    }

    async ensureInitialized() {
        await this.initPromise;
    }

    /**
     * Upload encrypted vote to IPFS
     * @param {Object} encryptedVoteData - Encrypted vote object
     * @returns {Promise<string>} IPFS CID
     */
    async uploadEncryptedVote(encryptedVoteData) {
        await this.ensureInitialized();
        
        if (!this.ipfs) {
            throw new Error('IPFS client not initialized. Is IPFS Desktop running?');
        }

        try {
            // Convert vote data to JSON string
            const voteJson = JSON.stringify(encryptedVoteData, null, 2);
            
            // Upload to IPFS
            const result = await this.ipfs.add(voteJson);
            
            console.log('✅ Encrypted vote uploaded to IPFS');
            console.log(`   CID: ${result.path}`);
            console.log(`   Size: ${result.size} bytes`);
            
            return result.path; // This is the CID
        } catch (error) {
            console.error('❌ Failed to upload to IPFS:', error.message);
            throw error;
        }
    }

    /**
     * Retrieve encrypted vote from IPFS
     * @param {string} cid - IPFS CID
     * @returns {Promise<Object>} Encrypted vote data
     */
    async retrieveEncryptedVote(cid) {
        await this.ensureInitialized();
        
        if (!this.ipfs) {
            throw new Error('IPFS client not initialized. Is IPFS Desktop running?');
        }

        try {
            const chunks = [];
            
            // Retrieve from IPFS
            for await (const chunk of this.ipfs.cat(cid)) {
                chunks.push(chunk);
            }
            
            // Combine chunks and parse JSON
            const data = Buffer.concat(chunks).toString('utf-8');
            const voteData = JSON.parse(data);
            
            console.log('✅ Retrieved encrypted vote from IPFS');
            
            return voteData;
        } catch (error) {
            console.error('❌ Failed to retrieve from IPFS:', error.message);
            throw error;
        }
    }

    /**
     * Pin encrypted vote to ensure it stays available
     * @param {string} cid - IPFS CID
     */
    async pinEncryptedVote(cid) {
        await this.ensureInitialized();
        
        if (!this.ipfs) {
            throw new Error('IPFS client not initialized');
        }

        try {
            await this.ipfs.pin.add(cid);
            console.log(`✅ Pinned CID: ${cid}`);
        } catch (error) {
            console.error('❌ Failed to pin:', error.message);
            throw error;
        }
    }

    /**
     * Save encrypted vote to local file (fallback if IPFS unavailable)
     * @param {Object} encryptedVoteData - Encrypted vote object
     * @param {string} filename - Output filename
     * @returns {Promise<string>} File path
     */
    async saveToFile(encryptedVoteData, filename) {
        const votesDir = path.join(__dirname, '..', 'encrypted_votes');
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(votesDir)) {
            fs.mkdirSync(votesDir, { recursive: true });
        }
        
        const filePath = path.join(votesDir, filename);
        const voteJson = JSON.stringify(encryptedVoteData, null, 2);
        
        fs.writeFileSync(filePath, voteJson);
        console.log(`✅ Saved encrypted vote to: ${filePath}`);
        
        return filePath;
    }

    /**
     * Load encrypted vote from local file
     * @param {string} filename - File to load
     * @returns {Promise<Object>} Encrypted vote data
     */
    async loadFromFile(filename) {
        const votesDir = path.join(__dirname, '..', 'encrypted_votes');
        const filePath = path.join(votesDir, filename);
        
        const voteJson = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(voteJson);
    }

    /**
     * Check if IPFS is available
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        await this.ensureInitialized();
        
        if (!this.ipfs) {
            return false;
        }

        try {
            const id = await this.ipfs.id();
            // Handle both ipfs-http-client format and fetch API format
            const peerId = id.ID || (id.id && id.id.toString()) || 'unknown';
            console.log(`✅ IPFS node connected: ${peerId.substring(0, 20)}...`);
            return true;
        } catch (error) {
            console.error(`❌ IPFS connection test failed: ${error.message}`);
            return false;
        }
    }
}

module.exports = IPFSManager;
