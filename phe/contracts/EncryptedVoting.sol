// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract EncryptedVoting {
    address public owner;
    
    struct VoterRecord {
        bytes encryptedName;
        bytes encryptedVote;
    }
    
    VoterRecord[] private voterRecords;

    event VoteSubmitted(address indexed voter, uint256 index);

    constructor() {
        owner = msg.sender;
    }

    function submitVote(bytes calldata encryptedName, bytes calldata encryptedVote) external {
        voterRecords.push(VoterRecord({
            encryptedName: encryptedName,
            encryptedVote: encryptedVote
        }));
        emit VoteSubmitted(msg.sender, voterRecords.length - 1);
    }

    function voteCount() external view returns (uint256) {
        return voterRecords.length;
    }

    function getVoterRecord(uint256 i) external view returns (bytes memory encryptedName, bytes memory encryptedVote) {
        require(i < voterRecords.length, "out of range");
        return (voterRecords[i].encryptedName, voterRecords[i].encryptedVote);
    }
    
    function getEncryptedVote(uint256 i) external view returns (bytes memory) {
        require(i < voterRecords.length, "out of range");
        return voterRecords[i].encryptedVote;
    }
}
