// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DepositLogic} from "../src/DepositLogic.sol";
import {WalletFactory} from "../src/WalletFactory.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

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
    address internal newTreasury = address(0xCAFE);

    address internal treasury = address(0xBEEF);
    bytes32 internal salt = keccak256("user-1-usdc-0");

    event WalletDeployed(bytes32 indexed salt, address indexed wallet);
    event WalletSwept(address indexed wallet, address indexed token, uint256 amount, address treasury);
    event TreasuryUpdated(address indexed newTreasury);

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

    function testConstructorRevertsOnZeroImplementation() public {
        vm.expectRevert(bytes("ZERO_IMPL"));
        new WalletFactory(address(0), address(this), treasury);
    }

    function testConstructorRevertsOnZeroTreasury() public {
        vm.expectRevert(bytes("ZERO_TREASURY"));
        new WalletFactory(address(logic), address(this), address(0));
    }

    function testConstructorRevertsOnZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new WalletFactory(address(logic), address(0), treasury);
    }

    function testSetTreasuryUpdatesAndEmits() public {
        vm.expectEmit(true, false, false, true);
        emit TreasuryUpdated(newTreasury);
        factory.setTreasury(newTreasury);

        assertEq(factory.treasury(), newTreasury);
    }

    function testSetTreasuryRevertsZeroAddress() public {
        vm.expectRevert(bytes("ZERO_TREASURY"));
        factory.setTreasury(address(0));
    }

    function testSetTreasuryOnlyOwner() public {
        address attacker = address(0x1234);
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", attacker));
        factory.setTreasury(newTreasury);
    }

    function testDeployAndSweepEmitsEvents() public {
        address predicted = factory.predictDeterministicAddress(salt);
        token.mint(predicted, 7 ether);

        vm.expectEmit(true, true, false, true);
        emit WalletDeployed(salt, predicted);
        vm.expectEmit(true, true, false, true);
        emit WalletSwept(predicted, address(token), 7 ether, treasury);

        factory.deployAndSweep(salt, address(token));
    }

    function testDeployWithoutBalanceDoesNotSweep() public {
        address predicted = factory.predictDeterministicAddress(salt);

        vm.expectEmit(true, true, false, true);
        emit WalletDeployed(salt, predicted);
        factory.deployAndSweep(salt, address(token));

        assertEq(token.balanceOf(treasury), 0);
    }

    function testTreasuryUpdatePropagatesToExistingWalletOnNextSweep() public {
        address predicted = factory.predictDeterministicAddress(salt);
        token.mint(predicted, 1 ether);
        factory.deployAndSweep(salt, address(token));
        assertEq(token.balanceOf(treasury), 1 ether);

        factory.setTreasury(newTreasury);

        token.mint(predicted, 2 ether);
        factory.deployAndSweep(salt, address(token));

        assertEq(token.balanceOf(treasury), 1 ether);
        assertEq(token.balanceOf(newTreasury), 2 ether);
    }
}
