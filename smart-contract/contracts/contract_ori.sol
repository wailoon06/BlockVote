// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Contract {
    struct Voter {
        address wallet;
        string name;
        bytes32 icHash;
        string email;
        string status;
        bytes32 verificationCode;
        uint256 registeredAt;
        uint256 verifiedAt;
        bool isRegistered;
    }

    struct Candidate {
        address wallet;
        string name;
        bytes32 icHash;
        string email;
        string party;
        string manifesto;
        string status;
        bytes32 verificationCode;
        uint256 registeredAt;
        uint256 verifiedAt;
        bool isRegistered;
    }

    struct Organizer {
        address wallet;
        string organizationName;
        string email;
        string description;
        string status;
        uint256 registeredAt;
        bool isRegistered;
    }

    struct Election {
        uint256 id;
        string title;
        string description;
        address organizer;
        uint256 nominationStartTime;
        uint256 nominationEndTime;
        uint256 startTime;
        uint256 endTime;
        bool isActive;
        uint256 createdAt;
        uint256 totalVotes;
    }
    
    address public admin;
    address[] private voterAddresses;
    address[] private candidateAddresses;
    address[] private organizerList;
    
    uint256 private electionCounter;
    uint256[] private electionIds;
    mapping(uint256 => Election) public elections;

    mapping(bytes32 => bool) private usedICs;
    mapping(string => bool) private usedEmails;

    mapping(address => Voter) public voters;
    mapping(address => Candidate) public candidates;
    mapping(address => Organizer) public organizers;
    
    // Election-scoped candidacy (Phase 3 & 4)
    mapping(uint256 => address[]) private electionCandidateApplicants;
    mapping(uint256 => mapping(address => uint8)) public candidateApplicationStatus;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => uint256)) public candidateVotes;
    
    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "!admin");
        _;
    }

    event VoterRegistered(
        address indexed wallet,
        string name,
        string email,
        uint256 timestamp
    );
    
    event CandidateRegistered(
        address indexed wallet,
        string name,
        string email,
        uint256 timestamp
    );

    event OrganizerRegistered(
        address indexed applicant,
        string organizationName,
        uint256 timestamp
    );

    event VoterVerified(
        address indexed wallet,
        uint256 timestamp
    );

    event CandidateVerified(
        address indexed wallet,
        uint256 timestamp
    );

    event OrganizerVerified(
        address indexed applicant,
        uint256 timestamp
    );

    event OrganizerRejected(
        address indexed applicant,
        uint256 timestamp
    );

    event ElectionCreated(
        uint256 indexed electionId,
        string title,
        address indexed organizer,
        uint256 nominationStartTime,
        uint256 nominationEndTime,
        uint256 startTime,
        uint256 endTime,
        uint256 timestamp
    );

    event CandidateApplied(
        uint256 indexed electionId,
        address indexed candidateWallet,
        uint256 timestamp
    );

    event CandidateApproved(
        uint256 indexed electionId,
        address indexed candidateWallet,
        address indexed approver,
        uint256 timestamp
    );

    event CandidateRejected(
        uint256 indexed electionId,
        address indexed candidateWallet,
        address indexed rejector,
        uint256 timestamp
    );

    event VoteCast(
        uint256 indexed electionId,
        address indexed voter,
        address indexed candidate,
        uint256 timestamp
    );

    // Common functions
    function isICRegistered(string memory _ic) public view returns (bool) {
        bytes32 icHash = keccak256(abi.encodePacked(_ic));
        return usedICs[icHash];
    }
    
    function isEmailRegistered(string memory _email) public view returns (bool) {
        return usedEmails[_email];
    }
    
    //////////////////
    // Voter Logics //
    //////////////////
    function registerVoter(
        string memory _name,
        string memory _ic,
        string memory _email
    ) public returns (bytes32) {
        require(!voters[msg.sender].isRegistered, "registered");

        bytes32 icHash = keccak256(abi.encodePacked(_ic));
        require(!usedICs[icHash], "IC used");
        require(!usedEmails[_email], "email used");
        
        bytes32 verificationCode = keccak256(
            abi.encodePacked(
                msg.sender,
                _name,
                _ic,
                _email,
                block.timestamp
            )
        );
        voters[msg.sender] = Voter({
            wallet: msg.sender,
            name: _name,
            icHash: icHash,
            email: _email,
            status: "PENDING_VERIFICATION",
            verificationCode: verificationCode,
            registeredAt: block.timestamp,
            verifiedAt: 0,
            isRegistered: true
        });
        voterAddresses.push(msg.sender);
        usedICs[icHash] = true;
        usedEmails[_email] = true;
        
        emit VoterRegistered(msg.sender, _name, _email, block.timestamp);
        
        return verificationCode;
    }
    
    function verifyVoter(bytes32 _verificationCode) public {
        require(voters[msg.sender].isRegistered, "!registered");
        require(
            voters[msg.sender].verificationCode == _verificationCode,
            "!code"
        );
        require(
            keccak256(abi.encodePacked(voters[msg.sender].status)) == 
            keccak256(abi.encodePacked("PENDING_VERIFICATION")),
            "verified"
        );
        
        voters[msg.sender].status = "VERIFIED";
        voters[msg.sender].verifiedAt = block.timestamp;
        
        emit VoterVerified(msg.sender, block.timestamp);
    }

    function isVoterRegistered(address _wallet) public view returns (bool) {
        return voters[_wallet].isRegistered;
    }

    // Combined function to check if a wallet is registered as voter or candidate
    function isWalletRegistered(address _wallet) public view returns (bool) {
        return voters[_wallet].isRegistered || candidates[_wallet].isRegistered;
    }

    function getAllVoterAddresses() public view returns (address[] memory) {
        return voterAddresses;
    }

    function getTotalRegisteredVoters() public view returns (uint256) {
        return voterAddresses.length;
    }
    
    function getVoterInfo(address _wallet) public view returns (
        string memory name,
        string memory email,
        string memory status,
        uint256 registeredAt,
        uint256 verifiedAt
    ) {
        require(voters[_wallet].isRegistered, "!voter");
        
        Voter memory voter = voters[_wallet];
        return (
            voter.name,
            voter.email,
            voter.status,
            voter.registeredAt,
            voter.verifiedAt
        );
    }

    function getVotersBatch(uint256 _start, uint256 _count) public view returns (
        address[] memory wallets,
        string[] memory names,
        string[] memory emails,
        string[] memory statuses,
        uint256[] memory registeredAts
    ) {
        require(_start < voterAddresses.length, "!start");
        
        uint256 end = _start + _count;
        if (end > voterAddresses.length) {
            end = voterAddresses.length;
        }
        
        uint256 resultCount = end - _start;
        
        wallets = new address[](resultCount);
        names = new string[](resultCount);
        emails = new string[](resultCount);
        statuses = new string[](resultCount);
        registeredAts = new uint256[](resultCount);
        
        for (uint256 i = 0; i < resultCount; i++) {
            address voterAddress = voterAddresses[_start + i];
            Voter memory voter = voters[voterAddress];
            
            wallets[i] = voter.wallet;
            names[i] = voter.name;
            emails[i] = voter.email;
            statuses[i] = voter.status;
            registeredAts[i] = voter.registeredAt;
        }
        
        return (wallets, names, emails, statuses, registeredAts);
    }

    
    function registerCandidate(
        string memory _name,
        string memory _ic,
        string memory _email,
        string memory _party,
        string memory _manifesto
    ) public returns (bytes32) {
        require(!candidates[msg.sender].isRegistered, "registered");
        bytes32 icHash = keccak256(abi.encodePacked(_ic));
        require(!usedICs[icHash], "IC used");
        require(!usedEmails[_email], "email used");
        
        bytes32 verificationCode = keccak256(
            abi.encodePacked(
                msg.sender,
                _name,
                _ic,
                _email,
                block.timestamp
            )
        );
        candidates[msg.sender] = Candidate({
            wallet: msg.sender,
            name: _name,
            icHash: icHash,
            email: _email,
            party: _party,
            manifesto: _manifesto,
            status: "PENDING_VERIFICATION",
            verificationCode: verificationCode,
            registeredAt: block.timestamp,
            verifiedAt: 0,
            isRegistered: true
        });
        candidateAddresses.push(msg.sender);
        usedICs[icHash] = true;
        usedEmails[_email] = true;
        
        emit CandidateRegistered(msg.sender, _name, _email, block.timestamp);
        
        return verificationCode;
    }
    
    function verifyCandidate(bytes32 _verificationCode) public {
        require(candidates[msg.sender].isRegistered, "!registered");
        require(
            candidates[msg.sender].verificationCode == _verificationCode,
            "!code"
        );
        require(
            keccak256(abi.encodePacked(candidates[msg.sender].status)) == 
            keccak256(abi.encodePacked("PENDING_VERIFICATION")),
            "verified"
        );
        
        candidates[msg.sender].status = "VERIFIED";
        candidates[msg.sender].verifiedAt = block.timestamp;
        
        emit CandidateVerified(msg.sender, block.timestamp);
    }

    function isCandidateRegistered(address _wallet) public view returns (bool) {
        return candidates[_wallet].isRegistered;
    }
    
    function getAllCandidateAddresses() public view returns (address[] memory) {
        return candidateAddresses;
    }
    
    function getTotalRegisteredCandidates() public view returns (uint256) {
        return candidateAddresses.length;
    }
    
    function getCandidateInfo(address _wallet) public view returns (
        string memory name,
        string memory email,
        string memory party,
        string memory manifesto,
        string memory status,
        uint256 registeredAt,
        uint256 verifiedAt
    ) {
        require(candidates[_wallet].isRegistered, "!candidate");
        
        Candidate memory candidate = candidates[_wallet];
        return (
            candidate.name,
            candidate.email,
            candidate.party,
            candidate.manifesto,
            candidate.status,
            candidate.registeredAt,
            candidate.verifiedAt
        );
    }

    function getCandidatesBatch(uint256 _start, uint256 _count) public view returns (
        address[] memory wallets,
        string[] memory names,
        string[] memory emails,
        string[] memory statuses,
        uint256[] memory registeredAts
    ) {
        require(_start < candidateAddresses.length, "!start");
        
        uint256 end = _start + _count;
        if (end > candidateAddresses.length) {
            end = candidateAddresses.length;
        }
        
        uint256 resultCount = end - _start;
        
        wallets = new address[](resultCount);
        names = new string[](resultCount);
        emails = new string[](resultCount);
        statuses = new string[](resultCount);
        registeredAts = new uint256[](resultCount);
        
        for (uint256 i = 0; i < resultCount; i++) {
            address candidateAddress = candidateAddresses[_start + i];
            Candidate memory candidate = candidates[candidateAddress];
            
            wallets[i] = candidate.wallet;
            names[i] = candidate.name;
            emails[i] = candidate.email;
            statuses[i] = candidate.status;
            registeredAts[i] = candidate.registeredAt;
        }
        
        return (wallets, names, emails, statuses, registeredAts);
    }


    function registerOrganizer(
        string memory _organizationName,
        string memory _email,
        string memory _description
    ) public returns (bool) {
        require(!organizers[msg.sender].isRegistered, "applied");
        require(bytes(_organizationName).length > 0, "!name");
        require(bytes(_email).length > 0, "!email");
        
        organizers[msg.sender] = Organizer({
            wallet: msg.sender,
            organizationName: _organizationName,
            email: _email,
            description: _description,
            status: "PENDING",
            registeredAt: block.timestamp,
            isRegistered: true
        });
        
        organizerList.push(msg.sender);
        
        emit OrganizerRegistered(msg.sender, _organizationName, block.timestamp);
        
        return true;
    }

    function verifyOrganizer(address _applicant) public onlyAdmin returns (bool) {
        require(organizers[_applicant].isRegistered, "!found");
        require(
            keccak256(abi.encodePacked(organizers[_applicant].status)) == 
            keccak256(abi.encodePacked("PENDING")),
            "processed"
        );
        
        organizers[_applicant].status = "APPROVED";
        
        emit OrganizerVerified(_applicant, block.timestamp);
        
        return true;
    }

    function getOrganizerInfo(address _applicant) public view returns (
        string memory organizationName,
        string memory email,
        string memory description,
        string memory status,
        uint256 registeredAt
    ) {
        require(organizers[_applicant].isRegistered, "!found");
        
        Organizer memory org = organizers[_applicant];
        return (
            org.organizationName,
            org.email,
            org.description,
            org.status,
            org.registeredAt
        );
    }

    function getAllOrganizers() public view returns (address[] memory) {
        return organizerList;
    }

    function getPendingOrganizers() public view returns (address[] memory) {
        uint256 pendingCount = 0;
        for (uint256 i = 0; i < organizerList.length; i++) {
            if (keccak256(abi.encodePacked(organizers[organizerList[i]].status)) == 
                keccak256(abi.encodePacked("PENDING"))) {
                pendingCount++;
            }
        }
        
        address[] memory pending = new address[](pendingCount);
        uint256 currentIndex = 0;
        
        for (uint256 i = 0; i < organizerList.length; i++) {
            if (keccak256(abi.encodePacked(organizers[organizerList[i]].status)) == 
                keccak256(abi.encodePacked("PENDING"))) {
                pending[currentIndex] = organizerList[i];
                currentIndex++;
            }
        }
        
        return pending;
    }

    function isOrganizer(address _address) public view returns (bool) {
        return organizers[_address].isRegistered &&
               keccak256(abi.encodePacked(organizers[_address].status)) == 
               keccak256(abi.encodePacked("APPROVED"));
    }

    function isOrganizerRegistered(address _address) public view returns (bool) {
        return organizers[_address].isRegistered;
    }

    function isAdmin(address _address) public view returns (bool) {
        return _address == admin;
    }

    function createElection(
        string memory _title,
        string memory _description,
        uint256 _nominationStartTime,
        uint256 _nominationEndTime,
        uint256 _startTime,
        uint256 _endTime
    ) public returns (uint256) {
        require(isOrganizer(msg.sender), "!organizer");
        require(bytes(_title).length > 0, "!title");
        require(_nominationStartTime > block.timestamp, "!nomStart");
        require(_nominationEndTime > _nominationStartTime, "!nomEnd");
        require(_startTime > _nominationEndTime, "!voteStart");
        require(_endTime > _startTime, "!end");
        electionCounter++;
        uint256 newElectionId = electionCounter;
        elections[newElectionId] = Election({
            id: newElectionId,
            title: _title,
            description: _description,
            organizer: msg.sender,
            nominationStartTime: _nominationStartTime,
            nominationEndTime: _nominationEndTime,
            startTime: _startTime,
            endTime: _endTime,
            isActive: false,
            createdAt: block.timestamp,
            totalVotes: 0
        });
        electionIds.push(newElectionId);
        
        emit ElectionCreated(
            newElectionId,
            _title,
            msg.sender,
            _nominationStartTime,
            _nominationEndTime,
            _startTime,
            _endTime,
            block.timestamp
        );
        
        return newElectionId;
    }
    
    function getElectionInfo(uint256 _electionId) public view returns (
        string memory title,
        string memory description,
        address organizer,
        uint256 nominationStartTime,
        uint256 nominationEndTime,
        uint256 startTime,
        uint256 endTime,
        bool isActive,
        uint256 createdAt
    ) {
        require(_electionId > 0 && _electionId <= electionCounter, "!election");
        
        Election memory election = elections[_electionId];
        return (
            election.title,
            election.description,
            election.organizer,
            election.nominationStartTime,
            election.nominationEndTime,
            election.startTime,
            election.endTime,
            election.isActive,
            election.createdAt
        );
    }
    
    function getAllElectionIds() public view returns (uint256[] memory) {
        return electionIds;
    }
    
    function getTotalElections() public view returns (uint256) {
        return electionCounter;
    }
    
    function getElectionsByOrganizer(address _organizer) public view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < electionIds.length; i++) {
            if (elections[electionIds[i]].organizer == _organizer) {
                count++;
            }
        }
        uint256[] memory organizerElections = new uint256[](count);
        uint256 currentIndex = 0;
        for (uint256 i = 0; i < electionIds.length; i++) {
            if (elections[electionIds[i]].organizer == _organizer) {
                organizerElections[currentIndex] = electionIds[i];
                currentIndex++;
            }
        }
        
        return organizerElections;
    }
    
    function getActiveElections() public view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < electionIds.length; i++) {
            Election memory election = elections[electionIds[i]];
            if (election.isActive && 
                block.timestamp >= election.startTime && 
                block.timestamp <= election.endTime) {
                count++;
            }
        }
        uint256[] memory activeElections = new uint256[](count);
        uint256 currentIndex = 0;
        for (uint256 i = 0; i < electionIds.length; i++) {
            Election memory election = elections[electionIds[i]];
            if (election.isActive && 
                block.timestamp >= election.startTime && 
                block.timestamp <= election.endTime) {
                activeElections[currentIndex] = electionIds[i];
                currentIndex++;
            }
        }
        
        return activeElections;
    }

    function applyToElection(uint256 _electionId) public returns (bool) {
        require(_electionId <= electionCounter, "!found");
        Election memory election = elections[_electionId];
        require(
            block.timestamp >= election.nominationStartTime && 
            block.timestamp <= election.nominationEndTime,
            "!nomWindow"
        );
        require(candidates[msg.sender].isRegistered, "!registered");
        require(
            keccak256(abi.encodePacked(candidates[msg.sender].status)) == 
            keccak256(abi.encodePacked("VERIFIED")),
            "!verified"
        );
        require(
            candidateApplicationStatus[_electionId][msg.sender] == 0,
            "applied"
        );
        candidateApplicationStatus[_electionId][msg.sender] = 1;
        electionCandidateApplicants[_electionId].push(msg.sender);
        
        emit CandidateApplied(_electionId, msg.sender, block.timestamp);
        
        return true;
    }
    
    function getElectionCandidateApplicants(uint256 _electionId) public view returns (address[] memory) {
        require(_electionId <= electionCounter, "!found");
        return electionCandidateApplicants[_electionId];
    }
    
    function approveCandidateForElection(uint256 _electionId, address _candidateWallet) public returns (bool) {
        require(_electionId <= electionCounter, "!found");
        Election memory election = elections[_electionId];
        require(
            msg.sender == election.organizer || msg.sender == admin,
            "!auth"
        );
        require(
            candidateApplicationStatus[_electionId][_candidateWallet] == 1,
            "!pending"
        );
        require(
            block.timestamp < election.startTime,
            "started"
        );
        candidateApplicationStatus[_electionId][_candidateWallet] = 2;
        
        emit CandidateApproved(_electionId, _candidateWallet, msg.sender, block.timestamp);
        
        return true;
    }
    
    function rejectCandidateForElection(uint256 _electionId, address _candidateWallet) public returns (bool) {
        require(_electionId <= electionCounter, "!found");
        Election memory election = elections[_electionId];
        require(
            msg.sender == election.organizer || msg.sender == admin,
            "!auth"
        );
        require(
            candidateApplicationStatus[_electionId][_candidateWallet] == 1,
            "!pending"
        );
        require(
            block.timestamp < election.startTime,
            "started"
        );
        candidateApplicationStatus[_electionId][_candidateWallet] = 3;
        
        emit CandidateRejected(_electionId, _candidateWallet, msg.sender, block.timestamp);
        
        return true;
    }
    
    function getApprovedCandidates(uint256 _electionId) public view returns (address[] memory) {
        require(_electionId <= electionCounter, "!found");
        address[] memory applicants = electionCandidateApplicants[_electionId];
        uint256 approvedCount = 0;
        for (uint256 i = 0; i < applicants.length; i++) {
            if (candidateApplicationStatus[_electionId][applicants[i]] == 2) {
                approvedCount++;
            }
        }
        address[] memory approved = new address[](approvedCount);
        uint256 currentIndex = 0;
        for (uint256 i = 0; i < applicants.length; i++) {
            if (candidateApplicationStatus[_electionId][applicants[i]] == 2) {
                approved[currentIndex] = applicants[i];
                currentIndex++;
            }
        }
        
        return approved;
    }
    
    function vote(uint256 _electionId, address _candidateWallet) public returns (bool) {
        require(_electionId <= electionCounter, "!ID");
        Election storage election = elections[_electionId];
        require(
            block.timestamp >= election.startTime && block.timestamp <= election.endTime,
            "!open"
        );
        require(voters[msg.sender].isRegistered, "!voter");
        require(
            keccak256(abi.encodePacked(voters[msg.sender].status)) == keccak256(abi.encodePacked("VERIFIED")),
            "!verified"
        );
        require(!hasVoted[_electionId][msg.sender], "voted");
        require(
            candidateApplicationStatus[_electionId][_candidateWallet] == 2,
            "!approved"
        );
        hasVoted[_electionId][msg.sender] = true;
        candidateVotes[_electionId][_candidateWallet]++;
        election.totalVotes++;
        
        emit VoteCast(_electionId, msg.sender, _candidateWallet, block.timestamp);
        
        return true;
    }
    
    function hasVoterVoted(uint256 _electionId, address _voterWallet) public view returns (bool) {
        return hasVoted[_electionId][_voterWallet];
    }
    
    function getCandidateVotes(uint256 _electionId, address _candidateWallet) public view returns (uint256) {
        return candidateVotes[_electionId][_candidateWallet];
    }
    
    function getElectionTotalVotes(uint256 _electionId) public view returns (uint256) {
        require(_electionId <= electionCounter, "!ID");
        return elections[_electionId].totalVotes;
    }
}
