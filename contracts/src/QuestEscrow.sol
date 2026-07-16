// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title QuestEscrow
/// @notice Sponsors escrow a cUSD pot per quest; users claim a reward on a
///         trusted-signer EIP-712 attestation that the onchain action was done.
///         Reward amount is carried in the signed attestation and bounded onchain
///         (min..max) — no onchain randomness. OneShot = 1 claim/wallet; Daily =
///         24h cooldown per wallet. Same EIP-712 trusted-signer pattern as DropRankBadge.
contract QuestEscrow {
    enum Kind {
        OneShot,
        Daily
    }

    struct Quest {
        address sponsor;
        address target; // sponsor app contract the user must interact with
        address token; // cUSD
        uint256 minReward;
        uint256 maxReward;
        uint256 left; // completions remaining
        uint64 deadline;
        Kind kind;
    }

    /// @notice Trusted backend attestor authorized to sign claims.
    address public immutable signer;
    /// @notice EIP-712 domain separator (name="ShipQuests" version="1").
    bytes32 public immutable domainSeparator;
    uint256 public nextId = 1;
    mapping(uint256 => Quest) public quests;
    /// @notice questId => wallet => last claim timestamp (0 = never claimed).
    mapping(uint256 => mapping(address => uint256)) public lastClaim;
    /// @notice questId => wallet => consecutive-day claim streak (Daily quests).
    ///         Incremented when a claim lands within 48h of the previous one,
    ///         reset to 1 otherwise. OneShot quests never store a streak.
    mapping(uint256 => mapping(address => uint256)) public streak;

    event QuestCreated(
        uint256 indexed id,
        address indexed sponsor,
        address token,
        uint256 minReward,
        uint256 maxReward,
        uint256 maxCompletions,
        Kind kind,
        uint64 deadline
    );
    event RewardClaimed(uint256 indexed questId, address indexed wallet, uint256 amount, uint256 streak);
    event UnclaimedWithdrawn(uint256 indexed questId, address indexed sponsor, uint256 remainder);

    /// @dev keccak256("Claim(uint256 questId,address wallet,uint256 amount,uint256 deadline)")
    bytes32 private constant CLAIM_TYPEHASH =
        keccak256("Claim(uint256 questId,address wallet,uint256 amount,uint256 deadline)");

    /// @notice questId => sponsor has reclaimed the unclaimed remainder.
    mapping(uint256 => bool) public withdrawn;

    uint256 private _lock = 1;

    modifier nonReentrant() {
        require(_lock == 1, "reentrant");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address _signer) {
        require(_signer != address(0), "zero signer");
        signer = _signer;
        domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("ShipQuests"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    /// @notice Fund a new quest, escrowing the full max payout (maxReward * maxCompletions).
    function createQuest(
        address target,
        address token,
        uint256 minReward,
        uint256 maxReward,
        uint256 maxCompletions,
        Kind kind,
        uint64 deadline
    ) external returns (uint256 id) {
        require(maxReward >= minReward && maxReward > 0, "bad reward");
        require(maxCompletions > 0, "bad count");
        require(deadline > block.timestamp, "bad deadline");
        id = nextId++;
        quests[id] = Quest(msg.sender, target, token, minReward, maxReward, maxCompletions, deadline, kind);
        emit QuestCreated(id, msg.sender, token, minReward, maxReward, maxCompletions, kind, deadline);
        require(IERC20(token).transferFrom(msg.sender, address(this), maxReward * maxCompletions), "fund fail");
    }

    /// @notice Claim a reward against a trusted-signer EIP-712 attestation.
    ///         `wallet` in the signed payload is bound to msg.sender (anti-replay
    ///         cross-wallet). Amount is bounded onchain to [minReward, maxReward].
    function claim(uint256 questId, uint256 amount, uint256 deadline, bytes calldata sig) external nonReentrant {
        Quest storage q = quests[questId];
        require(q.left > 0, "exhausted");
        require(block.timestamp <= deadline, "expired");
        require(block.timestamp <= q.deadline, "quest over");
        require(amount >= q.minReward && amount <= q.maxReward, "amount oob");
        uint256 s = 1;
        if (q.kind == Kind.OneShot) {
            require(lastClaim[questId][msg.sender] == 0, "already claimed");
        } else {
            uint256 last = lastClaim[questId][msg.sender];
            // last == 0 means never claimed: first daily claim is always allowed.
            require(last == 0 || block.timestamp >= last + 24 hours, "cooldown");
            // Consecutive day (claim within 48h of the previous one) extends the
            // streak; a longer gap resets it to 1.
            if (last != 0 && block.timestamp <= last + 48 hours) {
                s = streak[questId][msg.sender] + 1;
            }
            streak[questId][msg.sender] = s;
        }
        bytes32 structHash = keccak256(abi.encode(CLAIM_TYPEHASH, questId, msg.sender, amount, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        require(_recover(digest, sig) == signer, "bad sig");
        lastClaim[questId][msg.sender] = block.timestamp;
        q.left -= 1;
        emit RewardClaimed(questId, msg.sender, amount, s);
        require(IERC20(q.token).transfer(msg.sender, amount), "pay fail");
    }

    /// @notice After a quest's deadline, the sponsor reclaims the escrowed
    ///         remainder for completions that were never claimed. Callable once.
    function withdrawUnclaimed(uint256 questId) external nonReentrant {
        Quest storage q = quests[questId];
        require(msg.sender == q.sponsor, "not sponsor");
        require(block.timestamp > q.deadline, "not over");
        require(!withdrawn[questId], "done");
        withdrawn[questId] = true;
        uint256 remainder = q.maxReward * q.left;
        q.left = 0;
        emit UnclaimedWithdrawn(questId, q.sponsor, remainder);
        require(IERC20(q.token).transfer(q.sponsor, remainder), "wd fail");
    }

    /// @dev Recover the signer from a packed 65-byte (r,s,v) signature.
    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        require(sig.length == 65, "siglen");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        return ecrecover(digest, v, r, s);
    }
}
