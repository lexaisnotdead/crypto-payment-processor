// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {DepositLogic} from "../src/DepositLogic.sol";

contract MockERC20ForDeposit {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "BAL");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract DepositLogicTest is Test {
    DepositLogic internal implementation;
    DepositLogic internal wallet;
    MockERC20ForDeposit internal token;

    address internal treasury = address(0xBEEF);
    address internal newTreasury = address(0xCAFE);
    address internal owner = address(this);
    address internal attacker = address(0x1234);

    event Swept(address indexed token, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    function setUp() public {
        implementation = new DepositLogic();
        wallet = DepositLogic(Clones.clone(address(implementation)));
        wallet.initialize(owner, treasury);
        token = new MockERC20ForDeposit();
    }

    function testInitializeSetsOwnerAndTreasury() public view {
        assertEq(wallet.owner(), owner);
        assertEq(wallet.treasury(), treasury);
    }

    function testInitializeRevertsOnZeroTreasury() public {
        DepositLogic clone = DepositLogic(Clones.clone(address(implementation)));
        vm.expectRevert(bytes("ZERO_TREASURY"));
        clone.initialize(owner, address(0));
    }

    function testInitializeCannotBeCalledTwice() public {
        vm.expectRevert();
        wallet.initialize(owner, treasury);
    }

    function testSweepTransfersBalanceAndEmits() public {
        token.mint(address(wallet), 5 ether);

        vm.expectEmit(true, false, false, true);
        emit Swept(address(token), 5 ether);
        wallet.sweep(address(token));

        assertEq(token.balanceOf(address(wallet)), 0);
        assertEq(token.balanceOf(treasury), 5 ether);
    }

    function testSweepRevertsForNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", attacker));
        wallet.sweep(address(token));
    }

    function testSweepRevertsOnZeroBalance() public {
        vm.expectRevert(bytes("ZERO_BALANCE"));
        wallet.sweep(address(token));
    }

    function testSetTreasuryUpdatesAndEmits() public {
        vm.expectEmit(true, true, false, true);
        emit TreasuryUpdated(treasury, newTreasury);
        wallet.setTreasury(newTreasury);

        assertEq(wallet.treasury(), newTreasury);
    }

    function testSetTreasuryRevertsOnZeroAddress() public {
        vm.expectRevert(bytes("ZERO_TREASURY"));
        wallet.setTreasury(address(0));
    }

    function testSetTreasuryOnlyOwner() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", attacker));
        wallet.setTreasury(newTreasury);
    }
}
