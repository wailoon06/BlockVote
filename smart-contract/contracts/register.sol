
// pragma solidity ^0.8.0;

// contract RegisterContract {
//     struct User {
//         string identityNumber;
//         string name;
//         string publicKeyHash;
//         uint256 timestamp;     // block.timestamp when registered
//         uint256 blockNumber;   // block.number when registered
//         bytes32 txHash;        // synthetic tx-hash (keccak256 of registration data)
//     }

//     User[] private users;

//     mapping(string => uint256) private identityToIndex;

//     event UserEnrolled(
//         string indexed identityNumber,
//         string name,
//         string publicKeyHash,
//         uint256 indexed blockNumber,
//         uint256 timestamp,
//         bytes32 txHash,
//         uint256 userIndex
//     );

//     function addUser(
//         string calldata name,
//         string calldata identityNumber,
//         string calldata publicKeyHash
//     ) external returns (uint256) {
//         require(identityToIndex[identityNumber] == 0, "User already registered");

//         bytes32 syntheticTxHash = keccak256(
//             abi.encodePacked(msg.sender, block.number, block.timestamp, identityNumber)
//         );

//         User memory u = User({
//             name: name,
//             identityNumber: identityNumber,
//             publicKeyHash: publicKeyHash,
//             timestamp: block.timestamp,
//             blockNumber: block.number,
//             txHash: syntheticTxHash
//         });

//         users.push(u);
//         uint256 index = users.length - 1;
//         // store 1-based index to distinguish "not present" (0)
//         identityToIndex[identityNumber] = index + 1;

//         emit UserEnrolled(identityNumber, name, publicKeyHash, block.number, block.timestamp, syntheticTxHash, index);

//         return index;
//     }

//     function getUser(string calldata identityNumber)
//         external
//         view
//         returns (
//             string memory name,
//             string memory publicKeyHash,
//             uint256 timestamp,
//             uint256 blockNumber_,
//             bytes32 txHash,
//             uint256 index
//         )
//     {
//         uint256 stored = identityToIndex[identityNumber];
//         require(stored != 0, "User not found");
//         uint256 idx = stored - 1;
//         User storage u = users[idx];
//         return (u.name, u.publicKeyHash, u.timestamp, u.blockNumber, u.txHash, idx);
//     }


//     function userCount() external view returns (uint256) {
//         return users.length;
//     }
// }

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Register {
    struct User {
        string name;
        uint256 ic;
        address wallet;
    }

    mapping(uint256 => User) public users;
    uint256 public userCount;

    event UserRegistered(string name, uint256 ic, address wallet);

    function registerUser(string memory _name, uint256 _ic) public {
        userCount++;
        users[userCount] = User(_name, _ic, msg.sender);
        emit UserRegistered(_name, _ic, msg.sender);
    }

    function getUser(uint256 _id) public view returns (string memory, uint256, address) {
        User memory u = users[_id];
        return (u.name, u.ic, u.wallet);
    }
}
