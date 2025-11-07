const express = require('express');
const bodyParser = require('body-parser');
const Web3 = require('web3');
const Web3Lib = Web3.default || Web3;
const contract = require('truffle-contract');
const KYCContract = require('../smart-contract/build/contracts/KYC.json');

const app = express();
// app.use(bodyParser.json());
app.use(express.json()); // Modern alternative to bodyParser

// Configuration
const PORT = process.env.PORT || 3000;
const providerUrl = process.env.PROVIDER || 'http://localhost:8545';
const adminAddress = process.env.ADMIN_ADDRESS || "0x16399BA64D58d0b8ed1751071fcD5f06B54000dC";

// Initialize Web3 and Contract
const web3 = new Web3Lib(providerUrl);
const KYC = contract(KYCContract);

const rawProvider = web3.currentProvider || web3.givenProvider;
const shimProvider = {
  send: function (payload, callback) {
    if (!rawProvider || !rawProvider.request) {
      return callback(new Error('No underlying provider request method'));
    }
    Promise.resolve(rawProvider.request(payload))
      .then((result) => callback(null, result))
      .catch(callback);
  },
  sendAsync: function (payload, callback) {
    this.send(payload, callback);
  },
  on: () => {},
  removeListener: () => {},
  disconnect: () => {},
  connected: false
};

KYC.setProvider(shimProvider);

// Middleware for error handling
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Input validation middleware
const validateAddress = (address) => {
  return web3.utils.isAddress(address);
};

const validateAddUser = (req, res, next) => {
  const { name, documentHash, userAddress } = req.body;
  
  if (!name || !documentHash || !userAddress) {
    return res.status(400).json({ 
      error: 'Missing required fields: name, documentHash, userAddress' 
    });
  }
  
  if (!validateAddress(userAddress)) {
    return res.status(400).json({ error: 'Invalid user address' });
  }
  
  next();
};

const validateVerifyUser = (req, res, next) => {
  const { userAddress } = req.body;
  
  if (!userAddress) {
    return res.status(400).json({ error: 'Missing userAddress' });
  }
  
  if (!validateAddress(userAddress)) {
    return res.status(400).json({ error: 'Invalid user address' });
  }
  
  next();
};

// Routes
app.post('/addUser', validateAddUser, asyncHandler(async (req, res) => {
  const { name, documentHash, userAddress } = req.body;
  
  const instance = await KYC.deployed();
  const tx = await instance.addUser(name, documentHash, { from: userAddress });
  
  res.status(200).json({ 
    message: "User added successfully",
    transactionHash: tx.tx,
    gasUsed: tx.receipt.gasUsed
  });
}));

app.post('/verifyUser', validateVerifyUser, asyncHandler(async (req, res) => {
  const { userAddress } = req.body;
  
  const instance = await KYC.deployed();
  const tx = await instance.verifyUser(userAddress, { from: adminAddress });
  
  res.status(200).json({ 
    message: "User verified successfully",
    transactionHash: tx.tx,
    gasUsed: tx.receipt.gasUsed
  });
}));

app.get('/isUserVerified/:userAddress', asyncHandler(async (req, res) => {
  const { userAddress } = req.params;
  
  if (!validateAddress(userAddress)) {
    return res.status(400).json({ error: 'Invalid user address' });
  }
  
  const instance = await KYC.deployed();
  const isVerified = await instance.isUserVerified(userAddress);
  
  res.status(200).json({ 
    userAddress,
    isVerified 
  });
}));

// Get user details endpoint
app.get('/getUser/:userAddress', asyncHandler(async (req, res) => {
  const { userAddress } = req.params;
  
  if (!validateAddress(userAddress)) {
    return res.status(400).json({ error: 'Invalid user address' });
  }
  
  const instance = await KYC.deployed();
  const user = await instance.getUser(userAddress);
  
  res.status(200).json({
    userAddress,
    name: user.name || user[0],
    documentHash: user.documentHash || user[1],
    isVerified: user.isVerified || user[2]
  });
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    provider: providerUrl,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  // Handle specific error types
  if (err.message.includes('revert')) {
    return res.status(400).json({ 
      error: 'Transaction reverted',
      details: err.message 
    });
  }
  
  if (err.message.includes('gas')) {
    return res.status(400).json({ 
      error: 'Gas estimation failed',
      details: err.message 
    });
  }
  
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const startServer = async () => {
  try {
    // Check blockchain connection
    const networkId = await web3.eth.net.getId();
    console.log(`Connected to network: ${networkId}`);
    
    // Check if contract is deployed
    const instance = await KYC.deployed();
    console.log(`KYC Contract deployed at: ${instance.address}`);
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Provider: ${providerUrl}`);
      console.log(`Admin Address: ${adminAddress}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();