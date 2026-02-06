import pickle
from lightphe import LightPHE

# Generate a Paillier cryptosystem (additively homomorphic)
cs = LightPHE(algorithm_name="Paillier")

# Save the whole object for a simple demo (contains keys)
with open("keys.pkl", "wb") as f:
    pickle.dump(cs, f)

print("✅ Generated Paillier keys and saved to py/keys.pkl")
