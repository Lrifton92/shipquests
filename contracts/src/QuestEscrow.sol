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
    uint256 public nextId = 1;
    mapping(uint256 => Quest) public quests;
    /// @notice questId => wallet => last claim timestamp (0 = never claimed).
    mapping(uint256 => mapping(address => uint256)) public lastClaim;

    constructor(address _signer) {
        require(_signer != address(0), "zero signer");
        signer = _signer;
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
        require(IERC20(token).transferFrom(msg.sender, address(this), maxReward * maxCompletions), "fund fail");
    }
}
