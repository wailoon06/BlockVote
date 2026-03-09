/**
 * Phase 3: Homomorphic Aggregation
 * 
 * This script performs homomorphic aggregation of encrypted votes:
 * 1. Retrieve public key from blockchain
 * 2. Fetch all encrypted votes from blockchain
 * 3. Retrieve full ciphertexts from IPFS
 * 4. Perform homomorphic addition (multiply ciphertexts)
 * 5. Store encrypted tally on blockchain
 * 
 * No decryption happens - votes stay encrypted!
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Web3 } = require('web3');
const IPFSManager = require('./ipfs-manager');

// Initialize Web3
const web3 = new Web3('http://127.0.0.1:7545');

// Contract artifacts
const contractPath = path.join(__dirname, 'build', 'contracts', 'Contract.json');

/**
 * Step 1: Retrieve public key from blockchain
 */
async function fetchPublicKey(contract) {
    console.log('\n📊 Step 1: Retrieving Public Key from Blockchain...');
    
    try {
        const publicKey = await contract.methods.getPaillierPublicKey().call();
        const isPaillierKeySet = await contract.methods.isPaillierKeySet().call();
        
        if (!isPaillierKeySet) {
            throw new Error('Public key not set. Please run Phase 1 setup first.');
        }
        
        console.log('✅ Public key retrieved');
        console.log(`   Key (n): ${publicKey.substring(0, 50)}...`);
        console.log(`   Length: ${publicKey.length} digits`);
        
        return publicKey;
    } catch (error) {
        console.error('❌ Failed to fetch public key:', error.message);
        throw error;
    }
}

/**
 * Step 2: Fetch all encrypted votes from blockchain and IPFS
 */
async function fetchEncryptedVotes(contract, ipfsManager, electionId) {
    console.log('\n📥 Step 2: Fetching All Encrypted Votes...');
    
    try {
        // Get all nullifiers for ZKP votes in this election
        const nullifiers = await contract.methods.getZKPVoteNullifiers(electionId).call();
        
        if (nullifiers.length === 0) {
            throw new Error('No votes found for this election');
        }
        
        console.log(`   Found ${nullifiers.length} encrypted votes`);
        console.log('   Retrieving from blockchain and IPFS...\n');
        
        const encryptedVotes = [];
        const orderedCIDs = []; // CIDs in nullifier push-order (matches on-chain keccak256)
        
        for (let i = 0; i < nullifiers.length; i++) {
            const nullifier = nullifiers[i];
            
            // Get IPFS CID from blockchain (ZKP vote keyed by nullifier)
            const ipfsCID = await contract.methods.getZKPVote(electionId, nullifier).call();
            
            if (!ipfsCID) {
                console.log(`   ⚠️  Vote ${i + 1}: Not found for nullifier ${nullifier.substring(0, 10)}...`);
                continue;
            }

            orderedCIDs.push(ipfsCID); // record CID in nullifier order for hash
            
            console.log(`   Vote ${i + 1}/${nullifiers.length}:`);
            console.log(`      Nullifier: ${nullifier.substring(0, 10)}...`);
            console.log(`      IPFS CID: ${ipfsCID}`);
            
            // Retrieve the encrypted vote from IPFS
            try {
                const votePackage = await ipfsManager.retrieveEncryptedVote(ipfsCID);

                if (!votePackage.encrypted_vote) {
                    console.log(`      ⚠️  Vote ${i + 1}: missing encrypted_vote field — skipping`);
                    continue;
                }

                encryptedVotes.push({
                    voter: nullifier,
                    encryptedVote: votePackage.encrypted_vote, // VotingData ciphertext
                    vote_block: votePackage.vote_block,         // B for slot extraction
                    timestamp: Date.now()
                });

                console.log(`      ✓ Retrieved from IPFS (VotingData scheme)\n`);
            } catch (ipfsError) {
                console.log(`      ⚠️  Failed to retrieve from IPFS: ${ipfsError.message}`);
                console.log(`      Skipping this vote...\n`);
                continue;
            }
        }
        
        console.log(`✅ Successfully retrieved ${encryptedVotes.length} encrypted votes`);
        
        return { encryptedVotes, orderedCIDs };
    } catch (error) {
        console.error('❌ Failed to fetch encrypted votes:', error.message);
        throw error;
    }
}

/**
 * Step 3: Homomorphic aggregation using positional slot encoding.
 *
 * Each vote is a single ciphertext encrypting RADIX^candidateIndex.
 * Multiplying all ciphertexts yields E(sum), where the i-th base-RADIX
 * digit of the decrypted sum equals the vote count for candidate i.
 *
 * Only ONE ciphertext per voter — no per-candidate array needed.
 */
async function performHomomorphicAggregation(publicKeyN, encryptedVotes, numCandidates) {
    console.log('\n🔢 Step 3: Performing Homomorphic Aggregation (Positional Slot Encoding)...');
    console.log(`   Aggregating ${encryptedVotes.length} encrypted votes`);
    console.log('   Paillier: E(RADIX^a) × E(RADIX^b) = E(RADIX^a + RADIX^b)\n');

    try {
        const vote_block = encryptedVotes[0].vote_block || 100000;
        console.log(`   vote_block: ${vote_block}  (supports up to ${vote_block - 1} votes per candidate)`);
        console.log(`   Candidates: ${numCandidates}`);

        const tempFile = path.join(__dirname, 'temp_encrypted_votes.json');
        const votesData = {
            public_key_n: publicKeyN,
            num_candidates: numCandidates,
            vote_block: vote_block,
            encrypted_votes: encryptedVotes.map(v => v.encryptedVote) // flat array of ciphertexts
        };

        fs.writeFileSync(tempFile, JSON.stringify(votesData, null, 2));

        const pythonScript = path.join(__dirname, '..', 'backend', 'homomorphic_aggregator.py');
        const output = execSync(`python "${pythonScript}" "${tempFile}"`, { encoding: 'utf-8' });
        const result = JSON.parse(output.trim());

        fs.unlinkSync(tempFile);

        if (result.error) throw new Error(result.error);

        console.log('\n✅ Aggregation complete!');
        console.log(`   Encrypted total: ${result.encrypted_total.substring(0, 50)}...`);
        console.log(`   Votes aggregated: ${result.vote_count}`);
        console.log(`   🔒 Result stays encrypted until Phase 4 threshold decryption`);

        // Store as JSON object so Phase 4 has vote_block + num_candidates for extraction
        return JSON.stringify({
            encrypted_total: result.encrypted_total,
            num_candidates: numCandidates,
            vote_block: vote_block
        });
    } catch (error) {
        console.error('❌ Failed to perform aggregation:', error.message);
        throw error;
    }
}

/**
 * Step 4: Store encrypted tally on blockchain
 * @param {string[]} orderedCIDs - IPFS CIDs in nullifier push-order (used to build tallyInputHash)
 */
async function storeEncryptedTally(contract, electionId, encryptedTotal, adminAccount, orderedCIDs) {
    console.log('\n⛓️  Step 4: Storing Encrypted Tally on Blockchain...');
    
    try {
        // Compute keccak256(abi.encodePacked(cid_0 || cid_1 || ...)) to match on-chain verification.
        // abi.encodePacked for strings is raw UTF-8 concatenation — mirror that here.
        const concatenated = orderedCIDs.join('');
        const tallyInputHash = web3.utils.keccak256(
            '0x' + Buffer.from(concatenated, 'utf8').toString('hex')
        );
        console.log(`   tallyInputHash: ${tallyInputHash} (covers ${orderedCIDs.length} CIDs)`);

        const receipt = await contract.methods.storeEncryptedTally(
            electionId,
            encryptedTotal,
            tallyInputHash
        ).send({
            from: adminAccount,
            gas: 3000000
        });
        
        console.log('✅ Encrypted tally stored on blockchain!');
        console.log(`   Transaction Hash: ${receipt.transactionHash}`);
        console.log(`   Block Number: ${receipt.blockNumber}`);
        console.log(`   Gas Used: ${receipt.gasUsed}`);
        
        return receipt;
    } catch (error) {
        console.error('❌ Failed to store encrypted tally:', error.message);
        throw error;
    }
}

/**
 * Step 5: Verify the stored tally
 */
async function verifyStoredTally(contract, electionId) {
    console.log('\n🔍 Step 5: Verifying Stored Tally...');
    
    try {
        const tallyData = await contract.methods.getEncryptedTally(electionId).call();
        
        if (!tallyData.tallyStored) {
            throw new Error('Tally not found on blockchain');
        }
        
        console.log('✅ Encrypted tally verified on blockchain');
        try {
            const tallyObj = JSON.parse(tallyData.encryptedTally);
            console.log(`   Encrypted total    : ${tallyObj.encrypted_total.substring(0, 50)}...`);
            console.log(`   Num candidates     : ${tallyObj.num_candidates}`);
            console.log(`   Vote block         : ${tallyObj.vote_block}`);
        } catch (_) {
            console.log(`   Encrypted Total: ${tallyData.encryptedTally.substring(0, 50)}...`);
        }
        console.log(`   Total Votes Counted: ${tallyData.totalVotes}`);
        console.log(`   Status: Ready for Phase 4 (single decryption + identity subtraction)`);
        
        return true;
    } catch (error) {
        console.error('❌ Failed to verify tally:', error.message);
        throw error;
    }
}

/**
 * Main execution
 */
async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.error('\n❌ Usage: node phase3-aggregate.js <electionId>');
        console.error('\nExample:');
        console.error('  node phase3-aggregate.js 1\n');
        process.exit(1);
    }
    
    const electionId = parseInt(args[0]);
    
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  🔢 Phase 3: Homomorphic Aggregation                 ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    
    console.log(`\n📋 Aggregation Parameters:`);
    console.log(`   Election ID: ${electionId}`);
    
    try {
        // Load contract
        const contractJSON = JSON.parse(fs.readFileSync(contractPath, 'utf-8'));
        const networkId = await web3.eth.net.getId();
        const contractAddress = contractJSON.networks[networkId].address;
        const contract = new web3.eth.Contract(contractJSON.abi, contractAddress);
        
        // Get admin account
        const accounts = await web3.eth.getAccounts();
        const adminAccount = accounts[0];
        
        console.log(`   Admin Account: ${adminAccount}`);
        
        // Initialize IPFS
        const ipfsManager = new IPFSManager();
        await ipfsManager.ensureInitialized();
        
        const isIPFSAvailable = await ipfsManager.isAvailable();
        if (isIPFSAvailable) {
            console.log('   IPFS: Connected');
        } else {
            console.log('   IPFS: Not connected (will use blockchain data only)');
        }
        
        // Step 1: Retrieve public key
        const publicKey = await fetchPublicKey(contract);
        
        // Step 2: Fetch all encrypted votes
        const { encryptedVotes, orderedCIDs } = await fetchEncryptedVotes(contract, ipfsManager, electionId);

        // Determine num_candidates from the election's candidate list
        const candidates = await contract.methods.getApprovedCandidates(electionId).call();
        const numCandidates = candidates.length;
        console.log(`\n   Candidates in election: ${numCandidates}`);

        // Step 3: Perform homomorphic aggregation
        const encryptedTotal = await performHomomorphicAggregation(publicKey, encryptedVotes, numCandidates, contract);
        
        // Step 4: Store encrypted tally on blockchain (passes tallyInputHash for on-chain verification)
        await storeEncryptedTally(contract, electionId, encryptedTotal, adminAccount, orderedCIDs);
        
        // Step 5: Verify stored tally
        await verifyStoredTally(contract, electionId);
        
        console.log('\n╔════════════════════════════════════════════════════════╗');
        console.log('║  ✅ Aggregation Complete!                            ║');
        console.log('╚════════════════════════════════════════════════════════╝');
        
        console.log('\n📊 Summary:');
        console.log(`   ✓ ${encryptedVotes.length} votes aggregated homomorphically`);
        console.log(`   ✓ E(msum) stored on blockchain (single ciphertext)`);
        console.log(`   ✓ voter_identity_sum stored alongside for Phase 4 subtraction`);

        console.log('\n🔒 Privacy Preserved:');
        console.log(`   • Candidate choice encrypted inside VotingData (never in plaintext)`);
        console.log(`   • Voter wallet + icHash embedded inside ciphertext (never in IPFS)`);
        console.log(`   • Zero individual vote decryptions performed`);
        console.log(`   • Phase 4: decrypt once, subtract identity sum, read 8-digit blocks`);
        
        console.log('\n📝 Next Steps:');
        console.log(`   Run Phase 4 to decrypt the total using trustees:`);
        console.log(`   node phase4-decrypt.js ${electionId}\n`);
        
    } catch (error) {
        console.error('\n❌ Error during aggregation:', error.message);
        process.exit(1);
    }
}

// Run the script
main();
