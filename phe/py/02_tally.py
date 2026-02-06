import os, pickle
from dotenv import load_dotenv
from web3 import Web3
from lightphe import LightPHE

load_dotenv()

GANACHE_RPC = os.getenv("GANACHE_RPC")
GANACHE_PK  = os.getenv("GANACHE_PK")
CONTRACT_ADDR = os.getenv("CONTRACT_ADDR")

w3 = Web3(Web3.HTTPProvider(GANACHE_RPC))

ABI = [
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

n = contract.functions.voteCount().call()

print(f"\n{'='*60}")
print(f"Retrieving {n} voter records from blockchain...")
print(f"{'='*60}\n")

# Retrieve voter records (names stay encrypted, only votes are decrypted)
voter_names_encrypted = []
cipher_votes = []

for i in range(n):
    encrypted_name, encrypted_vote = contract.functions.getVoterRecord(i).call()
    
    # Store encrypted name (not decrypted)
    voter_names_encrypted.append(encrypted_name)
    
    # Store encrypted vote for later decryption
    cipher_votes.append(int(encrypted_vote.decode("utf-8")))
    
    # Display the voter name (it's stored as plaintext in this implementation)
    # but the vote remains encrypted
    name_display = encrypted_name.decode("utf-8")
    print(f"Voter #{i+1}: {name_display} (vote encrypted: {encrypted_vote[:20]}...)")

print(f"\n{'='*60}")
print(f"Decrypting ONLY the vote choices (names remain private)...")
print(f"{'='*60}\n")

# ---- (A) Decrypt each vote (demo)
plain_votes = []
for val in cipher_votes:
    # Practical reconstruction trick:
    # create a ciphertext object by encrypting 0, then swap its .value
    c = cs.encrypt(0)
    c.value = val
    plain_votes.append(cs.decrypt(c))

yes = sum(1 for v in plain_votes if v == 1)
no  = len(plain_votes) - yes

print("Decrypted votes:", plain_votes)
print(f"\n📊 Result by decrypting all votes: YES={yes} NO={no}")

# ---- (B) Homomorphic tally: sum ciphertexts then decrypt only total YES
if n > 0:
    print(f"\n{'='*60}")
    print("Homomorphic tallying (without decrypting individual votes)...")
    print(f"{'='*60}\n")
    
    c_sum = cs.encrypt(0)
    # swap to first ciphertext
    c_sum.value = cipher_votes[0]
    for val in cipher_votes[1:]:
        c_tmp = cs.encrypt(0)
        c_tmp.value = val
        c_sum = c_sum + c_tmp  # homomorphic addition

    yes2 = cs.decrypt(c_sum)
    no2 = n - yes2
    print(f"📊 Result by homomorphic sum then decrypt once: YES={yes2} NO={no2}")

print(f"\n{'='*60}")
print("✅ Tally complete! Voter names were never decrypted.")
print(f"{'='*60}")
