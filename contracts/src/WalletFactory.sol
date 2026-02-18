// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IDepositLogic {
    function initialize(address owner_, address treasury_) external;
    function sweep(address token) external;
    function setTreasury(address newTreasury) external;
    function treasury() external view returns (address);
}

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

contract WalletFactory is Ownable {
    address public immutable implementation;
    address public treasury;

    event WalletDeployed(bytes32 indexed salt, address indexed wallet);
    event WalletSwept(address indexed wallet, address indexed token, uint256 amount, address treasury);
    event TreasuryUpdated(address indexed newTreasury);

    constructor(address _implementation, address _owner, address _treasury) Ownable(_owner) {
        require(_implementation != address(0), "ZERO_IMPL");
        require(_treasury != address(0), "ZERO_TREASURY");
        implementation = _implementation;
        treasury = _treasury;
    }

    function predictDeterministicAddress(bytes32 salt) public view returns (address) {
        return Clones.predictDeterministicAddress(implementation, salt, address(this));
    }

    function deployAndSweep(bytes32 salt, address token) external onlyOwner returns (address wallet) {
        wallet = predictDeterministicAddress(salt);

        if (wallet.code.length == 0) {    
            wallet = Clones.cloneDeterministic(implementation, salt);
            IDepositLogic(wallet).initialize(address(this), treasury);

            emit WalletDeployed(salt, wallet);
        } else if (IDepositLogic(wallet).treasury() != treasury) {
            IDepositLogic(wallet).setTreasury(treasury);
        }

        uint256 amount = IERC20(token).balanceOf(wallet);
        if (amount > 0) {
            IDepositLogic(wallet).sweep(token);

            emit WalletSwept(wallet, token, amount, treasury);
        }
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "ZERO_TREASURY");
        treasury = newTreasury;

        emit TreasuryUpdated(newTreasury);
    }
}
