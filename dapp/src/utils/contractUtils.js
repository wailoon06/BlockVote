import contract from "../contract.json";

// Singleton Web3 instance — avoids re-registering MetaMask message listeners on every call
let _web3 = null;

export const getWeb3 = async () => {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('MetaMask not found');
  }
  if (!_web3) {
    const Web3 = (await import('web3')).default;
    _web3 = new Web3(window.ethereum);
  }
  return _web3;
};

export const getDeployedContract = async () => {
  const web3 = await getWeb3();
  
  const chainId = await web3.eth.getChainId();
  const networkId = await web3.eth.net.getId();
  const possibleIds = [chainId, networkId, 5777, 1337];
  
  let deployedNetwork = null;
  for (const id of possibleIds) {
    if (contract.networks[id]) {
      deployedNetwork = contract.networks[id];
      break;
    }
  }
  
  if (!deployedNetwork) {
    throw new Error(`Contract not deployed! Chain ID: ${chainId}, Network ID: ${networkId}. Make sure Ganache is running and contract is deployed.`);
  }

  const code = await web3.eth.getCode(deployedNetwork.address);
  if (code === '0x' || code === '0x0') {
    throw new Error(`No contract found at address ${deployedNetwork.address}. This usually means MetaMask is connected to the wrong network (e.g., wrong port like 8545 instead of 7545), or you need to deploy the contract on the currently connected network.`);
  }

  const deployedContract = new web3.eth.Contract(
    contract.abi,
    deployedNetwork.address
  );

  return { web3, deployedContract, contractAddress: deployedNetwork.address };
};

export const verifyContractExists = async (web3, contractAddress) => {
  const code = await web3.eth.getCode(contractAddress);
  if (code === '0x' || code === '0x0') {
    throw new Error(`No contract found at address ${contractAddress}. Please re-deploy the contract with 'truffle migrate --reset'.`);
  }
  return true;
};
