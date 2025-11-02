// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
contract KYC {
    struct User {
        string name;
        string documentHash;
        bool isVerified;
    }
    
    mapping(address => User) public users;
    address public admin;

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }
    constructor() {
        admin = msg.sender;
    }
    function addUser(string memory _name, string memory _documentHash) public {
        users[msg.sender] = User(_name, _documentHash, false);
    }
    function verifyUser(address _userAddress) public onlyAdmin {
        users[_userAddress].isVerified = true;
    }
    function isUserVerified(address _userAddress) public view returns (bool) {
        return users[_userAddress].isVerified;
    }
}