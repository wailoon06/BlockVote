import os, pickle
from dotenv import load_dotenv
from web3 import Web3
from lightphe import LightPHE

load_dotenv()

GANACHE_RPC = os.getenv("GANACHE_RPC")
GANACHE_PK  = os.getenv("GANACHE_PK")
CONTRACT_ADDR = os.getenv("CONTRACT_ADDR")

assert GANACHE_RPC and GANACHE_PK and CONTRACT_ADDR, "Missing env vars in .env"

w3 = Web3(Web3.HTTPProvider(GANACHE_RPC))
acct = w3.eth.account.from_key(GANACHE_PK)

# Updated ABI: submitVote(bytes encryptedName, bytes encryptedVote), voteCount(), getVoterRecord(uint), getEncryptedVote(uint)
ABI = [
  {"inputs":[{"internalType":"bytes","name":"encryptedName","type":"bytes"},
             {"internalType":"bytes","name":"encryptedVote","type":"bytes"}],
   "name":"submitVote","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"voteCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],
   "stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"i","type":"uint256"}],
   "name":"getVoterRecord","outputs":[{"internalType":"bytes","name":"encryptedName","type":"bytes"},
                                      {"internalType":"bytes","name":"encryptedVote","type":"bytes"}],
   "stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"i","type":"uint256"}],
   "name":"getEncryptedVote","outputs":[{"internalType":"bytes","name":"","type":"bytes"}],
   "stateMutability":"view","type":"function"},
]

contract = w3.eth.contract(address=Web3.to_checksum_address(CONTRACT_ADDR), abi=ABI)

with open("keys.pkl", "rb") as f:
    cs: LightPHE = pickle.load(f)

# Voter data: (name, vote) where vote: 1 = YES, 0 = NO
voters = [
    ("Alice", 1),
    ("Bob", 0),
    ("Charlie", 1),
    ("Diana", 1),
    ("Eve", 0)
]

print(f"Using sender: {acct.address}")
print("Encrypting + submitting voter names and votes...")

for name, vote in voters:
    # Encrypt the voter name (we'll store each character's ASCII value encrypted)
    # For simplicity, we'll encrypt a numeric representation of the name
    # Alternative: store name as plaintext or use a different approach
    # Here, we'll just encrypt the vote and keep name as a simple marker
    
    # For demonstration, we'll store the name directly (not encrypted for readability)
    # But we can encrypt it if needed
    name_bytes = name.encode("utf-8")
    
    # Encrypt the vote
    encrypted_vote = cs.encrypt(vote)
    vote_bytes = str(encrypted_vote.value).encode("utf-8")

    tx = contract.functions.submitVote(name_bytes, vote_bytes).build_transaction({
        "from": acct.address,
        "nonce": w3.eth.get_transaction_count(acct.address),
        "gas": 5000000,
        "gasPrice": w3.to_wei("2", "gwei"),
    })

    signed = acct.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    print(f"  ✅ voter={name} vote={vote} tx={tx_hash.hex()} block={receipt.blockNumber}")

print("Done.")
print("On-chain voteCount =", contract.functions.voteCount().call())
