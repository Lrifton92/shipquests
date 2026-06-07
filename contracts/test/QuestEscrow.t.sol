// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {QuestEscrow} from "../src/QuestEscrow.sol";
import {MockERC20} from "./MockERC20.sol";

contract QuestEscrowTest is Test {
    QuestEscrow esc;
    MockERC20 cusd;

    uint256 constant SIGNER_PK = 0xA11CE;
    uint256 constant USER_PK = 0xBADA55;

    address signer = vm.addr(SIGNER_PK);
    address sponsor = address(0xBEEF);
    address user = vm.addr(USER_PK);
    address target = address(0xDEAD); // sponsor's app contract

    function setUp() public {
        cusd = new MockERC20();
        esc = new QuestEscrow(signer);
        cusd.mint(sponsor, 1000e18);
        vm.prank(sponsor);
        cusd.approve(address(esc), type(uint256).max);
    }

    // --- Task 2: createQuest ------------------------------------------------

    function test_createQuest_escrowsMaxPayout() public {
        vm.prank(sponsor);
        uint256 id = esc.createQuest(
            target, address(cusd), 1e18, 5e18, 10, QuestEscrow.Kind.Daily, uint64(block.timestamp + 30 days)
        );
        // escrow holds maxReward * maxCompletions = 5e18 * 10
        assertEq(cusd.balanceOf(address(esc)), 50e18);
        (,,, uint256 minR, uint256 maxR, uint256 left,,) = esc.quests(id);
        assertEq(minR, 1e18);
        assertEq(maxR, 5e18);
        assertEq(left, 10);
    }

    // --- EIP-712 helper -----------------------------------------------------

    function _sign(uint256 id, address wallet, uint256 amount, uint256 deadline) internal view returns (bytes memory) {
        bytes32 domain = esc.domainSeparator();
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Claim(uint256 questId,address wallet,uint256 amount,uint256 deadline)"),
                id,
                wallet,
                amount,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, digest);
        return abi.encodePacked(r, s, v);
    }

    // --- Task 3: claim one-shot ---------------------------------------------

    function test_claim_oneShot_paysOnce() public {
        vm.prank(sponsor);
        uint256 id = esc.createQuest(
            target, address(cusd), 2e18, 2e18, 3, QuestEscrow.Kind.OneShot, uint64(block.timestamp + 1 days)
        );
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(id, user, 2e18, dl);
        vm.prank(user);
        esc.claim(id, 2e18, dl, sig);
        assertEq(cusd.balanceOf(user), 2e18);
        // second claim by same user reverts
        bytes memory sig2 = _sign(id, user, 2e18, dl);
        vm.prank(user);
        vm.expectRevert(bytes("already claimed"));
        esc.claim(id, 2e18, dl, sig2);
    }

    // --- Task 4: daily cooldown + bounds + signer ---------------------------

    function test_claim_daily_cooldown() public {
        vm.prank(sponsor);
        uint256 id = esc.createQuest(
            target, address(cusd), 1e18, 5e18, 10, QuestEscrow.Kind.Daily, uint64(block.timestamp + 30 days)
        );
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(id, user, 3e18, dl);
        vm.prank(user);
        esc.claim(id, 3e18, dl, sig);
        // immediate second claim reverts (cooldown)
        uint256 dl2 = block.timestamp + 1 hours;
        bytes memory sig2 = _sign(id, user, 3e18, dl2);
        vm.prank(user);
        vm.expectRevert(bytes("cooldown"));
        esc.claim(id, 3e18, dl2, sig2);
        // after 24h it works again
        vm.warp(block.timestamp + 24 hours);
        uint256 dl3 = block.timestamp + 1 hours;
        bytes memory sig3 = _sign(id, user, 4e18, dl3);
        vm.prank(user);
        esc.claim(id, 4e18, dl3, sig3);
        assertEq(cusd.balanceOf(user), 7e18);
    }

    function test_claim_amountOutOfBounds_reverts() public {
        vm.prank(sponsor);
        uint256 id = esc.createQuest(
            target, address(cusd), 1e18, 5e18, 10, QuestEscrow.Kind.Daily, uint64(block.timestamp + 30 days)
        );
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(id, user, 9e18, dl); // above maxReward
        vm.prank(user);
        vm.expectRevert(bytes("amount oob"));
        esc.claim(id, 9e18, dl, sig);
    }

    function test_claim_wrongSigner_reverts() public {
        vm.prank(sponsor);
        uint256 id = esc.createQuest(
            target, address(cusd), 2e18, 2e18, 3, QuestEscrow.Kind.OneShot, uint64(block.timestamp + 1 days)
        );
        uint256 dl = block.timestamp + 1 hours;
        bytes32 domain = esc.domainSeparator();
        bytes32 sh = keccak256(
            abi.encode(
                keccak256("Claim(uint256 questId,address wallet,uint256 amount,uint256 deadline)"),
                id,
                user,
                uint256(2e18),
                dl
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, sh));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, digest); // wrong key
        vm.prank(user);
        vm.expectRevert(bytes("bad sig"));
        esc.claim(id, 2e18, dl, abi.encodePacked(r, s, v));
    }
}
