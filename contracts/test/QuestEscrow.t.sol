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
}
