// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DepositLogic} from "../src/DepositLogic.sol";
import {WalletFactory} from "../src/WalletFactory.sol";

contract MockERC20 {
    string public name = "Mock";
    string public symbol = "MOCK";
    uint8 public decimals = 18;

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

contract FactoryTest is Test {
    DepositLogic internal logic;
    WalletFactory internal factory;
    MockERC20 internal token;

    address internal treasury = address(0xBEEF);
    bytes32 internal salt = keccak256("user-1-usdc-0");

    function setUp() public {
        logic = new DepositLogic();
        factory = new WalletFactory(address(logic), address(this), treasury);
        token = new MockERC20();
    }

    function testPredictAddressAndSweep() public {
        address predicted = factory.predictDeterministicAddress(salt);
        token.mint(predicted, 10 ether);

        factory.deployAndSweep(salt, address(token));

        assertEq(token.balanceOf(treasury), 10 ether);
    }

    function testRepeatCallUsesSameWallet() public {
        address predicted = factory.predictDeterministicAddress(salt);
        token.mint(predicted, 1 ether);
        factory.deployAndSweep(salt, address(token));

        token.mint(predicted, 2 ether);
        factory.deployAndSweep(salt, address(token));

        assertEq(token.balanceOf(treasury), 3 ether);
    }

    function testOnlyOwner() public {
        vm.prank(address(0x1234));
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", address(0x1234)));
        factory.deployAndSweep(salt, address(token));
    }
}
