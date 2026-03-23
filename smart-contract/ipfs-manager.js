import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class IPFSManager {
    constructor() {
        this.jwt = process.env.PINATA_JWT;
        this.gateway = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs';
        this.initPromise = this.initializeIPFS();
    }

    async initializeIPFS() {
        try {
            if (!this.jwt || this.jwt === 'your_pinata_jwt_here') {
                console.warn('⚠️ PINATA_JWT not configured properly in environment variables');
                return false;
            }

            // Test Pinata Authentication
            await axios.get('https://api.pinata.cloud/data/testAuthentication', {
                headers: {
                    'Authorization': `Bearer ${this.jwt}`
                },
                timeout: 5000
            });
            
            console.log('✅ Pinata IPFS client initialized successfully');
            return true;
        } catch (error) {
            console.warn('⚠️ Pinata client initialization failed:', error.message);
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
        
        if (!this.jwt || this.jwt === 'your_pinata_jwt_here') {
            throw new Error('Pinata JWT is missing. Cannot upload to IPFS.');
        }

        try {
            const response = await axios.post(
                'https://api.pinata.cloud/pinning/pinJSONToIPFS',
                {
                    pinataContent: encryptedVoteData,
                    pinataMetadata: { name: 'vote.json' }
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.jwt}`
                    }
                }
            );
            
            console.log('✅ Encrypted vote uploaded to Pinata IPFS');
            console.log(`   CID: ${response.data.IpfsHash}`);
            console.log(`   Size: ${response.data.PinSize} bytes`);
            
            return response.data.IpfsHash; // This is the CID
        } catch (error) {
            console.error('❌ Failed to upload to Pinata IPFS:', error.message);
            if (error.response && error.response.data) {
                console.error('API Error:', error.response.data);
            }
            throw error;
        }
    }

    /**
     * Retrieve encrypted vote from IPFS
     * @param {string} cid - IPFS CID
     * @returns {Promise<Object>} Encrypted vote data
     */
    async retrieveEncryptedVote(cid) {
        try {
            // Retrieve via an IPFS Gateway
            const response = await axios.get(`${this.gateway}/${cid}`);
            console.log('✅ Retrieved encrypted vote from IPFS');
            return response.data;
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
        // Automatically pinned on upload via Pinata API
        console.log(`✅ Pinned CID: ${cid}`);
        return true;
    }

    /**
     * Save encrypted vote to local file (fallback if IPFS unavailable)
     * @param {Object} encryptedVoteData - Encrypted vote object
     * @param {string} filename - Output filename
     * @returns {Promise<string>} File path
     */
    async saveToFile(encryptedVoteData, filename) {
        const votesDir = path.join(__dirname, '..', 'encrypted_votes');
        
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
        if (!this.jwt || this.jwt === 'your_pinata_jwt_here') return false;
        
        try {
            await axios.get('https://api.pinata.cloud/data/testAuthentication', {
                headers: {
                    'Authorization': `Bearer ${this.jwt}`
                },
                timeout: 5000
            });
            console.log(`✅ Pinata IPFS connected`);
            return true;
        } catch (error) {
            console.error(`❌ Pinata connection test failed: ${error.message}`);
            return false;
        }
    }
}

export default IPFSManager;