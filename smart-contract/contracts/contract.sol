// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Interface for Groth16Verifier generated from regCheck circuit (Verifier.sol)
// Public signals order:
//   [0] ageThreshold
//   [1] nullifierHash      Poseidon(voterSecret, electionId)
//   [2] electionId
//   [3] voterCommitment    Poseidon(voterAddress, voterSecret)
//   [4] currentYear
//   [5] currentMonth
//   [6] currentDay
//   [7] numCandidates      approved candidate count
//   [8] choiceCommitment   Poseidon(candidateIndex, voterSecret, electionId)
//   [9] payloadHash        Hash of the IPFS CID (Mempool binding)
interface IVoteVerifier {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[10] calldata _pubSignals
    ) external view returns (bool);
}

// ── Custom errors (much cheaper in deployed bytecode than require string literals) ──
error Unauthorized();
error NotAdmin();
error NotTrustee();
error ZeroAddress();
error AlreadyRegistered();
error ICAlreadyUsed();
error EmailAlreadyUsed();
error NotRegistered();
error NotPending();
error NotVerified();
error NoVerifier();
error InvalidAge();
error InvalidElectionId();
error InvalidCommitment();
error InvalidDate();
error ProofFailed();
error AlreadyVoted();
error NotInNominationWindow();
error ElectionNotFound();
error ElectionNotOpen();
error EmptyInput();
error KeyNotSet();
error AlreadyKeySet();
error AlreadyCommitted();
error CandidateCountMismatch();
error TallyHashMismatch();
error TallyNotStored();
error AlreadyPublished();
error ElectionNotEnded();
error NoVotesCast();
error AlreadyProcessed();
error ElectionAlreadyStarted();
error InvalidThreshold();
error InsufficientTrustees();
error ThresholdTooLarge();
error TimingError();

contract Contract {
    // ===== PHASE 1: Paillier & Trustee Management =====
    struct Trustee {
        address walletAddress;
        bytes32 shareCommitment;  // Hash of the secret share
        bool hasSubmittedCommitment;
        uint256 registeredAt;
    }

    // Paillier Public Key Storage
    string public paillierPublicKeyN;  // Stored as string to handle large numbers
    bool public isPaillierKeySet;
    
    // Trustee Management
    address[] public trusteeAddresses;
    mapping(address => Trustee) public trustees;
    uint256 public threshold;  // Minimum trustees needed for decryption
    uint256 public numTrustees;  // Total number of trustees
    
    event PaillierPublicKeySet(string publicKeyN, uint256 timestamp);
    event TrusteeRegistered(address indexed trusteeAddress, uint256 timestamp);
    event ShareCommitmentSubmitted(address indexed trusteeAddress, bytes32 commitment, uint256 timestamp);
    
    // ===== EXISTING STRUCTS =====
    struct Voter {
        address wallet;
        string name;
        bytes32 icHash;
        string email;
        uint8 status;       // 0=PENDING_VERIFICATION, 1=VERIFIED
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
        uint8 status;       // 0=PENDING_VERIFICATION, 1=VERIFIED
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
        uint8 status;       // 0=PENDING, 1=APPROVED, 2=REJECTED
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
        string encryptedTally;  // Homomorphically aggregated encrypted total
        bool tallyStored;
        // ===== PHASE 4 =====
        string decryptedResult;  // JSON-encoded decrypted tally per candidate
        bool resultsPublished;
    }
    
    // ===== PHASE 2: Encrypted Voting =====
    event EncryptedTallyStored(
        uint256 indexed electionId,
        string encryptedTally,
        uint256 totalVotesCounted,
        uint256 timestamp
    );
    
    // ===== PHASE 4 Events =====
    event ResultsPublished(
        uint256 indexed electionId,
        string decryptedResult,
        uint256 timestamp
    );

    // ===== STATE VARIABLES =====
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
    // candidateVotes removed - using encrypted voting instead
    
    // ===== ZKP VOTING =====
    IVoteVerifier public voteVerifier;
    // Poseidon commitment: H(voterAddress, voterSecret) — stored during voter verification
    mapping(bytes32 => bool) public voterCommitments;
    // Nullifier: H(voterSecret, electionId) — prevents double voting anonymously
    mapping(uint256 => mapping(bytes32 => bool)) public nullifierUsed;
    // Anonymous vote storage: electionId => nullifier => ipfsCID
    mapping(uint256 => mapping(bytes32 => string)) private zkpVotes;
    // Nullifiers list per election (for tally)
    mapping(uint256 => bytes32[]) private zkpVoteNullifiers;
    // Choice commitment: electionId => nullifier => choiceCommitment
    // Binds the encrypted ballot to a proven valid candidateIndex
    mapping(uint256 => mapping(bytes32 => bytes32)) public voteChoiceCommitments;

    event VoterCommitmentStored(bytes32 indexed commitment, uint256 timestamp);
    event ZKPVoteCast(
        uint256 indexed electionId,
        bytes32 indexed nullifierHash,
        bytes32 indexed choiceCommitment,
        uint256 timestamp
    );

    constructor(address[] memory _trusteeAddresses, uint256 _threshold) {
        if (_trusteeAddresses.length < 2) revert InsufficientTrustees();
        if (_threshold < 2) revert InvalidThreshold();
        if (_threshold > _trusteeAddresses.length) revert ThresholdTooLarge();
        
        admin = msg.sender;
        trusteeAddresses = _trusteeAddresses;
        threshold = _threshold;
        numTrustees = _trusteeAddresses.length;
        
        // Register trustees
        for (uint256 i = 0; i < _trusteeAddresses.length; i++) {
            address trusteeAddr = _trusteeAddresses[i];
            if (trusteeAddr == address(0)) revert ZeroAddress();
            
            trustees[trusteeAddr] = Trustee({
                walletAddress: trusteeAddr,
                shareCommitment: bytes32(0),
                hasSubmittedCommitment: false,
                registeredAt: block.timestamp
            });
            
            emit TrusteeRegistered(trusteeAddr, block.timestamp);
        }
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }
    
    modifier onlyTrustee() {
        if (trustees[msg.sender].walletAddress == address(0)) revert NotTrustee();
        _;
    }

    // Set ZKP Vote Verifier contract (VoteWithICAgeCheck verifier)
    function setVoteVerifier(address _voteVerifier) external onlyAdmin {
        if (_voteVerifier == address(0)) revert ZeroAddress();
        voteVerifier = IVoteVerifier(_voteVerifier);
    }

    // ===== PHASE 1: Paillier & Trustee Functions =====
    
    /**
     * @dev Set the Paillier public key (can only be set once by admin)
     * @param _publicKeyN The public key modulus N as a string
     */
    function setPaillierPublicKey(string calldata _publicKeyN) external onlyAdmin {
        if (isPaillierKeySet) revert AlreadyKeySet();
        if (bytes(_publicKeyN).length == 0) revert EmptyInput();
        
        paillierPublicKeyN = _publicKeyN;
        isPaillierKeySet = true;
        
        emit PaillierPublicKeySet(_publicKeyN, block.timestamp);
    }
    
    /**
     * @dev Submit a commitment (hash) of a trustee's secret share.
     *      Can be called by the trustee themselves, or by admin (e.g. during automated setup).
     * @param _trustee    Address of the trustee whose commitment is being submitted
     * @param _commitment Hash of the secret share (keccak256 of share data)
     */
    function submitShareCommitment(address _trustee, bytes32 _commitment) external {
        if (msg.sender != admin && msg.sender != _trustee) revert Unauthorized();
        if (trustees[_trustee].walletAddress == address(0)) revert NotTrustee();
        if (trustees[_trustee].hasSubmittedCommitment) revert AlreadyCommitted();
        if (_commitment == bytes32(0)) revert EmptyInput();

        trustees[_trustee].shareCommitment = _commitment;
        trustees[_trustee].hasSubmittedCommitment = true;

        emit ShareCommitmentSubmitted(_trustee, _commitment, block.timestamp);
    }
    
    /**
     * @dev Get Paillier public key
     */
    function getPaillierPublicKey() external view returns (string memory) {
        if (!isPaillierKeySet) revert KeyNotSet();
        return paillierPublicKeyN;
    }
    
    /**
     * @dev Get list of all trustee addresses
     */
    function getTrusteeAddresses() external view returns (address[] memory) {
        return trusteeAddresses;
    }
    
    /**
     * @dev Check if all trustees have submitted their commitments
     */
    function allTrusteesCommitted() external view returns (bool) {
        for (uint256 i = 0; i < trusteeAddresses.length; i++) {
            if (!trustees[trusteeAddresses[i]].hasSubmittedCommitment) {
                return false;
            }
        }
        return true;
    }
    
    /**
     * @dev Get trustee information
     */
    function getTrusteeInfo(address _trustee) external view returns (
        address walletAddress,
        bytes32 shareCommitment,
        bool hasSubmittedCommitment,
        uint256 registeredAt
    ) {
        Trustee memory t = trustees[_trustee];
        return (
            t.walletAddress,
            t.shareCommitment,
            t.hasSubmittedCommitment,
            t.registeredAt
        );
    }

    // ===== PHASE 2: Encrypted Voting Functions =====
    // (votes now stored anonymously by ZKP nullifier — see getZKPVote / getZKPVoteNullifiers)

    function storeEncryptedTally(
        uint256 _electionId,
        string calldata _encryptedTally,
        bytes32 _tallyInputHash   // keccak256(abi.encodePacked(cid_0, cid_1, ...)) in nullifier order
    ) external {
        if (elections[_electionId].id == 0) revert ElectionNotFound();
        if (msg.sender != admin && msg.sender != elections[_electionId].organizer) revert Unauthorized();
        if (elections[_electionId].tallyStored) revert AlreadyPublished();
        if (bytes(_encryptedTally).length == 0) revert EmptyInput();
        if (block.timestamp <= elections[_electionId].endTime) revert ElectionNotEnded();
        
        uint256 voteCount = zkpVoteNullifiers[_electionId].length;
        if (voteCount == 0) revert NoVotesCast();

        bytes memory packed;
        for (uint256 i = 0; i < voteCount; i++) {
            bytes32 nullifier = zkpVoteNullifiers[_electionId][i];
            packed = abi.encodePacked(packed, zkpVotes[_electionId][nullifier]);
        }
        if (keccak256(packed) != _tallyInputHash) revert TallyHashMismatch();
        
        elections[_electionId].encryptedTally = _encryptedTally;
        elections[_electionId].tallyStored = true;
        elections[_electionId].totalVotes = voteCount;
        
        emit EncryptedTallyStored(_electionId, _encryptedTally, voteCount, block.timestamp);
    }

    function getEncryptedTally(uint256 _electionId) external view returns (
        string memory encryptedTally, uint256 totalVotes, bool tallyStored
    ) {
        if (elections[_electionId].id == 0) revert ElectionNotFound();
        return (elections[_electionId].encryptedTally, elections[_electionId].totalVotes, elections[_electionId].tallyStored);
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

    // Common functions
    function isICRegistered(string calldata _ic) external view returns (bool) {
        bytes32 icHash = keccak256(abi.encodePacked(_ic));
        return usedICs[icHash];
    }
    
    function isEmailRegistered(string calldata _email) external view returns (bool) {
        return usedEmails[_email];
    }
    
    //////////////////
    // Voter Logics //
    //////////////////
    function registerVoter(
        string calldata _name,
        string calldata _ic,
        string calldata _email
    ) external returns (bytes32) {
        if (voters[msg.sender].isRegistered) revert AlreadyRegistered();

        bytes32 icHash = keccak256(abi.encodePacked(_ic));
        if (usedICs[icHash]) revert ICAlreadyUsed();
        if (usedEmails[_email]) revert EmailAlreadyUsed();
        
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
            status: 0,
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
    
    // Shared internal validation for registration-time ZKP proofs (regCheck circuit, electionId=0).
    function _validateRegZKPSignals(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[10] calldata _pubSignals
    ) internal view {
        if (address(voteVerifier) == address(0)) revert NoVerifier();
        if (_pubSignals[0] != 18) revert InvalidAge();
        if (_pubSignals[2] != 0) revert InvalidElectionId();
        if (_pubSignals[3] == 0) revert InvalidCommitment();
        (uint256 y, uint256 m, uint256 d) = _timestampToDate(block.timestamp);
        if (_pubSignals[4] != y) revert InvalidDate();
        if (_pubSignals[5] != m) revert InvalidDate();
        if (_pubSignals[6] != d) revert InvalidDate();
        if (!voteVerifier.verifyProof(_pA, _pB, _pC, _pubSignals)) revert ProofFailed();
    }

    // ZKP-based verification for voters (uses regCheck circuit — Verifier.sol)
    // electionId must be 0 (registration sentinel); numCandidates=1, candidateIndex=0 (dummy).
    function verifyVoterWithZKP(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[10] calldata _pubSignals
    ) external {
        if (!voters[msg.sender].isRegistered) revert NotRegistered();
        if (voters[msg.sender].status != 0) revert NotPending();
        _validateRegZKPSignals(_pA, _pB, _pC, _pubSignals);
        bytes32 commitment = bytes32(_pubSignals[3]);
        if (!voterCommitments[commitment]) {
            voterCommitments[commitment] = true;
            emit VoterCommitmentStored(commitment, block.timestamp);
        }
        voters[msg.sender].status = 1;
        voters[msg.sender].verifiedAt = block.timestamp;
        emit VoterVerified(msg.sender, block.timestamp);
    }

    function isVoterRegistered(address _wallet) external view returns (bool) {
        return voters[_wallet].isRegistered;
    }

    // Combined function to check if a wallet is registered as voter or candidate
    function isWalletRegistered(address _wallet) external view returns (bool) {
        return voters[_wallet].isRegistered || candidates[_wallet].isRegistered;
    }

    function getAllVoterAddresses() external view returns (address[] memory) {
        return voterAddresses;
    }

    function getTotalRegisteredVoters() external view returns (uint256) {
        return voterAddresses.length;
    }
    
    function getVoterInfo(address _wallet) external view returns (
        string memory name,
        string memory email,
        string memory status,
        uint256 registeredAt,
        uint256 verifiedAt
    ) {
        if (!voters[_wallet].isRegistered) revert NotRegistered();
        
        Voter memory voter = voters[_wallet];
        return (
            voter.name,
            voter.email,
            voter.status == 1 ? "VERIFIED" : "PENDING_VERIFICATION",
            voter.registeredAt,
            voter.verifiedAt
        );
    }

    // function getVotersBatch(uint256 _start, uint256 _count) public view returns (
    //     address[] memory wallets,
    //     string[] memory names,
    //     string[] memory emails,
    //     string[] memory statuses,
    //     uint256[] memory registeredAts
    // ) {
    //     require(_start < voterAddresses.length, "!start");
        
    //     uint256 end = _start + _count;
    //     if (end > voterAddresses.length) {
    //         end = voterAddresses.length;
    //     }
        
    //     uint256 resultCount = end - _start;
        
    //     wallets = new address[](resultCount);
    //     names = new string[](resultCount);
    //     emails = new string[](resultCount);
    //     statuses = new string[](resultCount);
    //     registeredAts = new uint256[](resultCount);
        
    //     for (uint256 i = 0; i < resultCount; i++) {
    //         address voterAddress = voterAddresses[_start + i];
    //         Voter memory voter = voters[voterAddress];
            
    //         wallets[i] = voter.wallet;
    //         names[i] = voter.name;
    //         emails[i] = voter.email;
    //         statuses[i] = voter.status;
    //         registeredAts[i] = voter.registeredAt;
    //     }
        
    //     return (wallets, names, emails, statuses, registeredAts);
    // }

    
    function registerCandidate(
        string calldata _name,
        string calldata _ic,
        string calldata _email,
        string calldata _party,
        string calldata _manifesto
    ) external returns (bytes32) {
        if (candidates[msg.sender].isRegistered) revert AlreadyRegistered();
        bytes32 icHash = keccak256(abi.encodePacked(_ic));
        if (usedICs[icHash]) revert ICAlreadyUsed();
        if (usedEmails[_email]) revert EmailAlreadyUsed();
        
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
            status: 0,
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
    
    // ZKP-based verification for candidates (same regCheck circuit, electionId=0)
    // numCandidates=1, candidateIndex=0 used as dummy values during registration.
    function verifyCandidateWithZKP(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[10] calldata _pubSignals
    ) external {
        if (!candidates[msg.sender].isRegistered) revert NotRegistered();
        if (candidates[msg.sender].status != 0) revert NotPending();
        _validateRegZKPSignals(_pA, _pB, _pC, _pubSignals);
        candidates[msg.sender].status = 1;
        candidates[msg.sender].verifiedAt = block.timestamp;
        emit CandidateVerified(msg.sender, block.timestamp);
    }

    function isCandidateRegistered(address _wallet) external view returns (bool) {
        return candidates[_wallet].isRegistered;
    }
    
    function getAllCandidateAddresses() external view returns (address[] memory) {
        return candidateAddresses;
    }
    
    function getCandidateInfo(address _wallet) external view returns (
        string memory name,
        string memory email,
        string memory party,
        string memory manifesto,
        string memory status,
        uint256 registeredAt,
        uint256 verifiedAt
    ) {
        if (!candidates[_wallet].isRegistered) revert NotRegistered();
        
        Candidate memory candidate = candidates[_wallet];
        return (
            candidate.name,
            candidate.email,
            candidate.party,
            candidate.manifesto,
            candidate.status == 1 ? "VERIFIED" : "PENDING_VERIFICATION",
            candidate.registeredAt,
            candidate.verifiedAt
        );
    }

    function registerOrganizer(
        string calldata _organizationName,
        string calldata _email,
        string calldata _description
    ) external returns (bool) {
        if (organizers[msg.sender].isRegistered) revert AlreadyRegistered();
        if (bytes(_organizationName).length == 0) revert EmptyInput();
        if (bytes(_email).length == 0) revert EmptyInput();
        
        organizers[msg.sender] = Organizer({
            wallet: msg.sender,
            organizationName: _organizationName,
            email: _email,
            description: _description,
            status: 0,
            registeredAt: block.timestamp,
            isRegistered: true
        });
        
        organizerList.push(msg.sender);
        
        emit OrganizerRegistered(msg.sender, _organizationName, block.timestamp);
        
        return true;
    }

    function verifyOrganizer(address _applicant) external onlyAdmin returns (bool) {
        if (!organizers[_applicant].isRegistered) revert NotRegistered();
        if (organizers[_applicant].status != 0) revert AlreadyProcessed();
        
        organizers[_applicant].status = 1;
        
        emit OrganizerVerified(_applicant, block.timestamp);
        
        return true;
    }

    function getOrganizerInfo(address _applicant) external view returns (
        string memory organizationName,
        string memory email,
        string memory description,
        string memory status,
        uint256 registeredAt
    ) {
        if (!organizers[_applicant].isRegistered) revert NotRegistered();
        
        Organizer memory org = organizers[_applicant];
        string memory statusStr = org.status == 1 ? "APPROVED" : (org.status == 2 ? "REJECTED" : "PENDING");
        return (
            org.organizationName,
            org.email,
            org.description,
            statusStr,
            org.registeredAt
        );
    }

    function getAllOrganizers() external view returns (address[] memory) {
        return organizerList;
    }

    function getPendingOrganizers() external view returns (address[] memory) {
        uint256 pendingCount = 0;
        for (uint256 i = 0; i < organizerList.length; i++) {
            if (organizers[organizerList[i]].status == 0) {
                pendingCount++;
            }
        }
        
        address[] memory pending = new address[](pendingCount);
        uint256 currentIndex = 0;
        
        for (uint256 i = 0; i < organizerList.length; i++) {
            if (organizers[organizerList[i]].status == 0) {
                pending[currentIndex] = organizerList[i];
                currentIndex++;
            }
        }
        
        return pending;
    }

    function isOrganizer(address _address) public view returns (bool) {
        return organizers[_address].isRegistered && organizers[_address].status == 1;
    }

    function isOrganizerRegistered(address _address) external view returns (bool) {
        return organizers[_address].isRegistered;
    }

    function isAdmin(address _address) external view returns (bool) {
        return _address == admin;
    }

    function createElection(
        string calldata _title,
        string calldata _description,
        uint256 _nominationStartTime,
        uint256 _nominationEndTime,
        uint256 _startTime,
        uint256 _endTime
    ) external returns (uint256) {
        if (!isOrganizer(msg.sender)) revert Unauthorized();
        if (bytes(_title).length == 0) revert EmptyInput();
        if (_nominationStartTime <= block.timestamp) revert TimingError();
        if (_nominationEndTime <= _nominationStartTime) revert TimingError();
        if (_startTime <= _nominationEndTime) revert TimingError();
        if (_endTime <= _startTime) revert TimingError();
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
            isActive: true,
            createdAt: block.timestamp,
            totalVotes: 0,
            encryptedTally: "",
            tallyStored: false,
            decryptedResult: "",
            resultsPublished: false
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
    
    function getElectionInfo(uint256 _electionId) external view returns (
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
        if (_electionId == 0 || _electionId > electionCounter) revert ElectionNotFound();
        
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
    
    function getAllElectionIds() external view returns (uint256[] memory) {
        return electionIds;
    }
    
    function getTotalElections() external view returns (uint256) {
        return electionCounter;
    }
    
    function getElectionsByOrganizer(address _organizer) external view returns (uint256[] memory) {
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
    
    function getActiveElections() external view returns (uint256[] memory) {
        return electionIds;
    }

    function applyToElection(uint256 _electionId) external returns (bool) {
        if (_electionId > electionCounter) revert ElectionNotFound();
        Election memory election = elections[_electionId];
        if (
            block.timestamp < election.nominationStartTime || 
            block.timestamp > election.nominationEndTime
        ) revert NotInNominationWindow();
        if (!candidates[msg.sender].isRegistered) revert NotRegistered();
        if (candidates[msg.sender].status != 1) revert NotVerified();
        if (candidateApplicationStatus[_electionId][msg.sender] != 0) revert AlreadyRegistered();
        candidateApplicationStatus[_electionId][msg.sender] = 1;
        electionCandidateApplicants[_electionId].push(msg.sender);
        
        emit CandidateApplied(_electionId, msg.sender, block.timestamp);
        
        return true;
    }
    
    function getElectionCandidateApplicants(uint256 _electionId) external view returns (address[] memory) {
        if (_electionId > electionCounter) revert ElectionNotFound();
        return electionCandidateApplicants[_electionId];
    }
    
    function approveCandidateForElection(uint256 _electionId, address _candidateWallet) external returns (bool) {
        if (_electionId > electionCounter) revert ElectionNotFound();
        Election memory election = elections[_electionId];
        if (msg.sender != election.organizer && msg.sender != admin) revert Unauthorized();
        if (candidateApplicationStatus[_electionId][_candidateWallet] != 1) revert NotPending();
        if (block.timestamp >= election.startTime) revert ElectionAlreadyStarted();
        candidateApplicationStatus[_electionId][_candidateWallet] = 2;
        
        emit CandidateApproved(_electionId, _candidateWallet, msg.sender, block.timestamp);
        
        return true;
    }
    
    function rejectCandidateForElection(uint256 _electionId, address _candidateWallet) external returns (bool) {
        if (_electionId > electionCounter) revert ElectionNotFound();
        Election memory election = elections[_electionId];
        if (msg.sender != election.organizer && msg.sender != admin) revert Unauthorized();
        if (candidateApplicationStatus[_electionId][_candidateWallet] != 1) revert NotPending();
        if (block.timestamp >= election.startTime) revert ElectionAlreadyStarted();
        candidateApplicationStatus[_electionId][_candidateWallet] = 3;
        
        emit CandidateRejected(_electionId, _candidateWallet, msg.sender, block.timestamp);
        
        return true;
    }
    
    function getApprovedCandidates(uint256 _electionId) public view returns (address[] memory) {
        if (_electionId > electionCounter) revert ElectionNotFound();
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
    
    /**
     * @dev Cast an encrypted vote using ZKP — proves eligibility without revealing identity.
     *
     * Public signals order (must match VoteWithICAgeCheck circuit):
     *   _pubSignals[0] = ageThreshold
     *   _pubSignals[1] = nullifierHash   (H(voterSecret, electionId) — prevents double voting)
     *   _pubSignals[2] = electionId
     *   _pubSignals[3] = voterCommitment (H(voterAddress, voterSecret) — proves registration)
     *   _pubSignals[4] = currentYear
     *   _pubSignals[5] = currentMonth
     *   _pubSignals[6] = currentDay
     *   _pubSignals[7] = numCandidates    (approved candidate count)
     *   _pubSignals[8] = choiceCommitment (Poseidon(candidateIndex, voterSecret, electionId))
     *   _pubSignals[9] = payloadHash      (Hash of the IPFS CID for mempool protection)
     *
     * @param _electionId  Election to vote in
     * @param _ipfsCID     IPFS CID of the encrypted ballot
     * @param _pA          ZKP proof component A
     * @param _pB          ZKP proof component B
     * @param _pC          ZKP proof component C
     * @param _pubSignals  10 public signals from the circuit
     */
    function vote(
        uint256 _electionId,
        string calldata _ipfsCID,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[10] calldata _pubSignals
    ) external returns (bool) {
        if (_electionId > electionCounter) revert ElectionNotFound();
        Election storage election = elections[_electionId];
        if (block.timestamp < election.startTime || block.timestamp > election.endTime) revert ElectionNotOpen();
        if (bytes(_ipfsCID).length == 0) revert EmptyInput();
        if (!isPaillierKeySet) revert KeyNotSet();
        if (address(voteVerifier) == address(0)) revert NoVerifier();

        // ── 1. Mempool Front-Running Protection ──
        // Ensure the ZKP is definitively bound to THIS specific ipfsCID payload.
        // Convert Keccak256 hash to BN254 scalar field to match the SNARK circuit expectation.
        uint256 expectedPayloadHash = uint256(keccak256(abi.encodePacked(_ipfsCID))) % 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        if (_pubSignals[9] != expectedPayloadHash) revert ProofFailed();

        if (_pubSignals[2] != _electionId) revert InvalidElectionId();
        if (_pubSignals[0] != 18) revert InvalidAge();

        (uint256 blockYear, uint256 blockMonth, uint256 blockDay) = _timestampToDate(block.timestamp);
        if (_pubSignals[4] != blockYear) revert InvalidDate();
        if (_pubSignals[5] != blockMonth) revert InvalidDate();
        if (_pubSignals[6] != blockDay) revert InvalidDate();

        if (_pubSignals[7] != getApprovedCandidates(_electionId).length) revert CandidateCountMismatch();

        bytes32 nullifier = bytes32(_pubSignals[1]);
        if (nullifierUsed[_electionId][nullifier]) revert AlreadyVoted();

        bytes32 commitment = bytes32(_pubSignals[3]);
        if (!voterCommitments[commitment]) revert NotRegistered();

        if (!voteVerifier.verifyProof(_pA, _pB, _pC, _pubSignals)) revert ProofFailed();

        // Record vote anonymously (keyed by nullifier, NOT address)
        bytes32 choiceCommitment = bytes32(_pubSignals[8]);
        nullifierUsed[_electionId][nullifier] = true;
        zkpVotes[_electionId][nullifier] = _ipfsCID;
        voteChoiceCommitments[_electionId][nullifier] = choiceCommitment;
        zkpVoteNullifiers[_electionId].push(nullifier);
        election.totalVotes++;

        emit ZKPVoteCast(_electionId, nullifier, choiceCommitment, block.timestamp);

        return true;
    }

    /**
     * @dev Convert a Unix timestamp to (year, month, day).
     *      Used to validate the date embedded in the ZKP public signals.
     */
    function _timestampToDate(uint256 timestamp)
        internal
        pure
        returns (uint256 year, uint256 month, uint256 day)
    {
        uint256 z = timestamp / 86400 + 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        year = yoe + era * 400;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        day = doy - (153 * mp + 2) / 5 + 1;
        month = mp < 10 ? mp + 3 : mp - 9;
        if (month <= 2) year++;
    }

    /**
     * @dev Get the IPFS CID of an anonymous ZKP vote by its nullifier.
     */
    function getZKPVote(uint256 _electionId, bytes32 _nullifier)
        external
        view
        returns (string memory)
    {
        return zkpVotes[_electionId][_nullifier];
    }

    /**
     * @dev Get all nullifiers (anonymous voter tokens) for an election — used for tally.
     */
    function getZKPVoteNullifiers(uint256 _electionId)
        external
        view
        returns (bytes32[] memory)
    {
        return zkpVoteNullifiers[_electionId];
    }

    /**
     * @dev Get the choice commitment stored for a given nullifier.
     *      Voter can verify their ballot by recomputing
     *      Poseidon(candidateIndex, voterSecret, electionId) client-side
     *      and comparing against this value — without revealing their choice on-chain.
     */
    function getChoiceCommitment(uint256 _electionId, bytes32 _nullifier)
        external
        view
        returns (bytes32)
    {
        return voteChoiceCommitments[_electionId][_nullifier];
    }

    /**
     * @dev Check whether a nullifier has already been used in an election.
     *      Caller computes nullifier = Poseidon(voterSecret, electionId) client-side.
     *      Wallet address is never stored — voting is fully anonymous.
     */
    
    function getElectionTotalVotes(uint256 _electionId) external view returns (uint256) {
        if (_electionId > electionCounter) revert ElectionNotFound();
        return elections[_electionId].totalVotes;
    }
    
    // ===== PHASE 4: Threshold Decryption & Results =====
    
    mapping(uint256 => mapping(address => string)) public partialDecryptions;
    mapping(uint256 => address[]) public partialDecryptionSubmitters;

    event PartialDecryptionSubmitted(uint256 indexed electionId, address indexed trustee);

    /**
     * @dev Trustees submit their partial decryptions after local computation
     */
    function submitPartialDecryption(uint256 _electionId, string calldata _pd) external onlyTrustee {
        if (!elections[_electionId].tallyStored) revert TallyNotStored();
        if (bytes(partialDecryptions[_electionId][msg.sender]).length == 0) {
            partialDecryptionSubmitters[_electionId].push(msg.sender);
        }
        partialDecryptions[_electionId][msg.sender] = _pd;
        emit PartialDecryptionSubmitted(_electionId, msg.sender);
    }

    function getPartialDecryptionSubmitters(uint256 _electionId) external view returns (address[] memory) {
        return partialDecryptionSubmitters[_electionId];
    }

    function getPartialDecryption(uint256 _electionId, address _trustee) external view returns (string memory) {
        return partialDecryptions[_electionId][_trustee];
    }

    /**
     * @dev Publish the decrypted election results on-chain.
     *      Requires that enough decryption shares have been registered.
     * @param _electionId The election ID
     * @param _decryptedResult JSON-encoded decrypted tally (e.g. per-candidate totals)
     */
    function publishResults(uint256 _electionId, string calldata _decryptedResult) external {
        if (elections[_electionId].id == 0) revert ElectionNotFound();
        if (msg.sender != admin && msg.sender != elections[_electionId].organizer) revert Unauthorized();
        if (!elections[_electionId].tallyStored) revert TallyNotStored();
        if (elections[_electionId].resultsPublished) revert AlreadyPublished();
        if (bytes(_decryptedResult).length == 0) revert EmptyInput();
        
        elections[_electionId].decryptedResult = _decryptedResult;
        elections[_electionId].resultsPublished = true;
        
        emit ResultsPublished(_electionId, _decryptedResult, block.timestamp);
    }
    
    /**
     * @dev Get the published results for an election
     * @param _electionId The election ID
     */
    function getResults(uint256 _electionId) external view returns (
        string memory decryptedResult,
        bool resultsPublished,
        uint256 shareCount
    ) {
        if (elections[_electionId].id == 0) revert ElectionNotFound();
        return (
            elections[_electionId].decryptedResult,
            elections[_electionId].resultsPublished,
            0
        );
    }
    
}
