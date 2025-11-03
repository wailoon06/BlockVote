// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Voter_Register {
    
    struct Voter {
        address wallet;
        string name;
        bytes32 icHash;
        string email;
        string status;
        bytes32 verificationCode;
        uint256 registeredAt;
        bool isRegistered;
    }
    
    mapping(address => Voter) public voters;
    mapping(bytes32 => bool) private usedICs;
    mapping(string => bool) private usedEmails;
    
    // Array to store all registered addresses
    address[] private registeredAddresses;
    
    event VoterRegistered(
        address indexed wallet,
        string name,
        string email,
        uint256 timestamp
    );
    
    event VoterVerified(
        address indexed wallet,
        uint256 timestamp
    );
    
    modifier notRegistered() {
        require(!voters[msg.sender].isRegistered, "Wallet address already registered");
        _;
    }
    
    function registerVoter(
        string memory _name,
        string memory _ic,
        string memory _email
    ) public notRegistered returns (bytes32) {
        
        // Hash the IC for privacy
        bytes32 icHash = keccak256(abi.encodePacked(_ic));
        
        // Check if IC is already used
        require(!usedICs[icHash], "IC number already registered");
        
        // Check if email is already used (case-sensitive check)
        require(!usedEmails[_email], "Email already registered");
        
        // Generate verification code
        bytes32 verificationCode = keccak256(
            abi.encodePacked(
                msg.sender,
                _name,
                _ic,
                _email,
                block.timestamp
            )
        );
        
        // Store voter data
        voters[msg.sender] = Voter({
            wallet: msg.sender,
            name: _name,
            icHash: icHash,
            email: _email,
            status: "PENDING_VERIFICATION",
            verificationCode: verificationCode,
            registeredAt: block.timestamp,
            isRegistered: true
        });
        
        // Add address to registered addresses array
        registeredAddresses.push(msg.sender);
        
        // Mark IC and email as used
        usedICs[icHash] = true;
        usedEmails[_email] = true;
        
        emit VoterRegistered(msg.sender, _name, _email, block.timestamp);
        
        return verificationCode;
    }
    
    function verifyVoter(bytes32 _verificationCode) public {
        require(voters[msg.sender].isRegistered, "Voter not registered");
        require(
            voters[msg.sender].verificationCode == _verificationCode,
            "Invalid verification code"
        );
        require(
            keccak256(abi.encodePacked(voters[msg.sender].status)) == 
            keccak256(abi.encodePacked("PENDING_VERIFICATION")),
            "Voter already verified"
        );
        
        voters[msg.sender].status = "VERIFIED";
        
        emit VoterVerified(msg.sender, block.timestamp);
    }
    
    function getVoterInfo(address _wallet) public view returns (
        string memory name,
        string memory email,
        string memory status,
        uint256 registeredAt
    ) {
        require(voters[_wallet].isRegistered, "Voter not found");
        
        Voter memory voter = voters[_wallet];
        return (
            voter.name,
            voter.email,
            voter.status,
            voter.registeredAt
        );
    }
    
    function isWalletRegistered(address _wallet) public view returns (bool) {
        return voters[_wallet].isRegistered;
    }
    
    function isICRegistered(string memory _ic) public view returns (bool) {
        bytes32 icHash = keccak256(abi.encodePacked(_ic));
        return usedICs[icHash];
    }
    
    function isEmailRegistered(string memory _email) public view returns (bool) {
        return usedEmails[_email];
    }
    
    // Get all registered addresses
    function getAllRegisteredAddresses() public view returns (address[] memory) {
        return registeredAddresses;
    }
    
    // Get total number of registered voters
    function getTotalRegisteredVoters() public view returns (uint256) {
        return registeredAddresses.length;
    }
    
    // Get multiple voter details at once (batch query)
    function getVotersBatch(uint256 _start, uint256 _count) public view returns (
        address[] memory wallets,
        string[] memory names,
        string[] memory emails,
        string[] memory statuses,
        uint256[] memory registeredAts
    ) {
        require(_start < registeredAddresses.length, "Start index out of bounds");
        
        uint256 end = _start + _count;
        if (end > registeredAddresses.length) {
            end = registeredAddresses.length;
        }
        
        uint256 resultCount = end - _start;
        
        wallets = new address[](resultCount);
        names = new string[](resultCount);
        emails = new string[](resultCount);
        statuses = new string[](resultCount);
        registeredAts = new uint256[](resultCount);
        
        for (uint256 i = 0; i < resultCount; i++) {
            address voterAddress = registeredAddresses[_start + i];
            Voter memory voter = voters[voterAddress];
            
            wallets[i] = voter.wallet;
            names[i] = voter.name;
            emails[i] = voter.email;
            statuses[i] = voter.status;
            registeredAts[i] = voter.registeredAt;
        }
        
        return (wallets, names, emails, statuses, registeredAts);
    }
}