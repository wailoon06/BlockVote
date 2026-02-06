import contract from "../contract.json";

export const getWeb3 = async () => {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('MetaMask not found');
  }
  const Web3 = (await import('web3')).default;
  return new Web3(window.ethereum);
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
