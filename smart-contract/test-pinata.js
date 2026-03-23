import IPFSManager from './ipfs-manager.js';

async function testPinata() {
    console.log('--- Starting Pinata Connection Test ---');
    const ipfs = new IPFSManager();
    
    // 1. Test Authentication
    console.log('\n--- 1. Testing Connection & Authentication ---');
    const isAvailable = await ipfs.isAvailable();
    if (!isAvailable) {
        console.error('❌ Pinata is not available. Please check your .env credentials.');
        process.exit(1);
    }
    
    // 2. Test Upload
    console.log('\n--- 2. Testing Data Upload (Pinning) ---');
    const testData = {
        testMode: true,
        timestamp: new Date().toISOString(),
        message: "Hello from BlockVote Pinata Test!",
        mockVoteData: {
            candidateId: "CANDIDATE_1",
            encryptedVote: "0xMockEncryptedDataString..."
        }
    };
    
    let cid;
    try {
        cid = await ipfs.uploadEncryptedVote(testData);
        console.log(`✅ Successfully uploaded test data. CID: ${cid}`);
        console.log(`🔗 Gateway Link: ${ipfs.gateway}/${cid}`);
    } catch (error) {
        console.error('❌ Upload failed:', error.message);
        process.exit(1);
    }

    // 3. Test Retrieval
    console.log('\n--- 3. Testing Data Retrieval ---');
    try {
        const retrievedData = await ipfs.retrieveEncryptedVote(cid);
        console.log('✅ Successfully retrieved test data:');
        console.dir(retrievedData, { depth: null, colors: true });
        
        // Simple assertion
        if (retrievedData.message === testData.message) {
            console.log('\n🎉 ALL TESTS PASSED! Data matches perfectly.');
        } else {
            console.error('\n⚠️ Data mistmatch between uploaded and retrieved contents.');
        }
    } catch (error) {
        console.error('❌ Retrieval failed:', error.message);
    }
}

testPinata().catch(console.error);
